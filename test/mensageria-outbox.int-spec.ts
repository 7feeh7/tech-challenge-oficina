import { randomUUID } from 'node:crypto';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { DESTINO_FILA_BILLING } from '@/shared/messaging/envelope';
import type { FilaMensagensGateway } from '@/shared/messaging/application/ports/fila-mensagens.gateway';
import { FILA_MENSAGENS } from '@/shared/messaging/application/ports/tokens';
import { PublicadorOutboxService } from '@/shared/messaging/infra/outbox/publicador-outbox.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('Outbox — publicador (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let enviados: string[];

  class FilaMemoriaGateway implements FilaMensagensGateway {
    receber(): Promise<never[]> {
      return Promise.resolve([]);
    }
    confirmar(): Promise<void> {
      return Promise.resolve();
    }
    enviar(
      _url: string,
      envelope: unknown,
      _correlationId: string,
    ): Promise<void> {
      void _correlationId;
      const e = envelope as { eventId: string };
      enviados.push(e.eventId);
      return Promise.resolve();
    }
    enviarCorpoBruto(): Promise<void> {
      return Promise.resolve();
    }
  }

  beforeAll(async () => {
    exigirDatabaseUrl();
    enviados = [];

    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              OUTBOX_PUBLISHER_HABILITADO: 'false',
              SQS_CONSUMER_HABILITADO: 'false',
              SQS_BILLING_IN_URL: 'https://local/billing-in',
            }),
          ],
        }),
        PrismaModule,
        MensageriaModule,
      ],
    })
      .overrideProvider(FILA_MENSAGENS)
      .useClass(FilaMemoriaGateway)
      .compile();

    prisma = nestModule.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  beforeEach(async () => {
    enviados = [];
    await prisma.outboxMensagem.deleteMany();
  });

  async function inserirPendente(eventId: string): Promise<void> {
    await prisma.outboxMensagem.create({
      data: {
        eventId,
        eventType: 'os.teste.v1',
        envelope: {
          eventId,
          eventType: 'os.teste.v1',
          version: 1,
          occurredAt: new Date().toISOString(),
          source: 'os-service',
          correlationId: randomUUID(),
          causationId: null,
          ordemServicoId: randomUUID(),
          rodada: 1,
          payload: {},
        },
        correlationId: randomUUID(),
        destino: DESTINO_FILA_BILLING,
      },
    });
  }

  it('duas instâncias do publicador não publicam a mesma linha ao mesmo tempo', async () => {
    const ids = Array.from({ length: 6 }, () => randomUUID());
    for (const id of ids) await inserirPendente(id);

    const config = nestModule.get(ConfigService);
    const fila = nestModule.get<FilaMensagensGateway>(FILA_MENSAGENS);
    const notificacao = { publicar: jest.fn() };
    const pubA = new PublicadorOutboxService(prisma, config, fila, notificacao);
    const pubB = new PublicadorOutboxService(prisma, config, fila, notificacao);

    await Promise.all([pubA.publicarLote(), pubB.publicarLote()]);

    const unicos = new Set(enviados);
    expect(unicos.size).toBe(enviados.length);
    expect(unicos.size).toBe(6);

    const enviadas = await prisma.outboxMensagem.count({
      where: { enviadoEm: { not: null } },
    });
    expect(enviadas).toBe(6);
  });

  it('reivindicação vencida é retomada', async () => {
    const eventId = randomUUID();
    await prisma.outboxMensagem.create({
      data: {
        eventId,
        eventType: 'os.teste.v1',
        envelope: {
          eventId,
          eventType: 'os.teste.v1',
          version: 1,
          occurredAt: new Date().toISOString(),
          source: 'os-service',
          correlationId: randomUUID(),
          causationId: null,
          ordemServicoId: randomUUID(),
          rodada: 1,
          payload: {},
        },
        correlationId: randomUUID(),
        destino: DESTINO_FILA_BILLING,
        bloqueadoAte: new Date(Date.now() - 60_000),
        tokenReivindicacao: randomUUID(),
      },
    });

    const publicador = nestModule.get(PublicadorOutboxService);
    await publicador.publicarLote();

    expect(enviados).toEqual([eventId]);
  });

  it('falha de publicação grava bloqueado_ate progressivo', async () => {
    const eventId = randomUUID();
    const registro = await prisma.outboxMensagem.create({
      data: {
        eventId,
        eventType: 'os.teste.v1',
        envelope: { eventId },
        correlationId: randomUUID(),
        destino: DESTINO_FILA_BILLING,
      },
    });

    const config = nestModule.get(ConfigService);
    const filaFalha: FilaMensagensGateway = {
      receber: () => Promise.resolve([]),
      confirmar: () => Promise.resolve(),
      enviar: () => Promise.reject(new Error('indisponível')),
      enviarCorpoBruto: () => Promise.resolve(),
    };
    const publicador = new PublicadorOutboxService(prisma, config, filaFalha, {
      publicar: jest.fn(),
    });
    await publicador.publicarLote();

    const atualizado = await prisma.outboxMensagem.findUnique({
      where: { id: registro.id },
    });
    expect(atualizado?.tentativas).toBe(1);
    expect(atualizado?.bloqueadoAte).not.toBeNull();
    expect(atualizado?.bloqueadoAte!.getTime()).toBeGreaterThan(Date.now());
    expect(enviados).toHaveLength(0);
  });

  it('mensagens com falha contínua não ocupam o lote seguinte (bloqueado_ate)', async () => {
    const falhaId = randomUUID();
    const okId = randomUUID();
    await prisma.outboxMensagem.createMany({
      data: [
        {
          eventId: falhaId,
          eventType: 'os.teste.v1',
          envelope: { eventId: falhaId },
          correlationId: randomUUID(),
          destino: DESTINO_FILA_BILLING,
          tentativas: 3,
          bloqueadoAte: new Date(Date.now() + 60_000),
        },
        {
          eventId: okId,
          eventType: 'os.teste.v1',
          envelope: { eventId: okId },
          correlationId: randomUUID(),
          destino: DESTINO_FILA_BILLING,
        },
      ],
    });

    const publicador = nestModule.get(PublicadorOutboxService);
    await publicador.publicarLote();
    expect(enviados).toEqual([okId]);
  });

  it('fencing impede confirmação após perda de posse', async () => {
    const eventId = randomUUID();
    const mensagem = await prisma.outboxMensagem.create({
      data: {
        eventId,
        eventType: 'os.teste.v1',
        envelope: { eventId },
        correlationId: randomUUID(),
        destino: DESTINO_FILA_BILLING,
        bloqueadoAte: new Date(Date.now() + 60_000),
        tokenReivindicacao: randomUUID(),
      },
    });

    const publicador = nestModule.get(PublicadorOutboxService);
    await prisma.outboxMensagem.update({
      where: { id: mensagem.id },
      data: { tokenReivindicacao: randomUUID() },
    });

    await publicador.publicarMensagemReivindicada({
      id: mensagem.id,
      destino: DESTINO_FILA_BILLING,
      envelope: { eventId },
      correlationId: mensagem.correlationId,
      eventId,
      tokenReivindicacao: mensagem.tokenReivindicacao,
    });

    const atualizada = await prisma.outboxMensagem.findUnique({
      where: { id: mensagem.id },
    });
    expect(atualizada?.enviadoEm).toBeNull();
  });
});
