import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { PrismaUnitOfWork } from '@/shared/database/prisma-unit-of-work';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import { OUTBOX_GATEWAY } from '@/shared/messaging/application/ports/tokens';
import { PrismaMensagemProcessadaGateway } from '@/shared/messaging/infra/persistence/prisma-mensagem-processada.gateway';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { DESTINO_FILA_BILLING } from '@/shared/messaging/envelope';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('Mensageria — atomicidade (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let uow: PrismaUnitOfWork;
  let mensagens: PrismaMensagemProcessadaGateway;
  let outbox: OutboxGateway;

  beforeAll(async () => {
    exigirDatabaseUrl();

    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        MensageriaModule,
      ],
    }).compile();

    prisma = nestModule.get(PrismaService);
    uow = nestModule.get(PrismaUnitOfWork);
    mensagens = nestModule.get(PrismaMensagemProcessadaGateway);
    outbox = nestModule.get(OUTBOX_GATEWAY);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  beforeEach(async () => {
    await prisma.outboxMensagem.deleteMany();
    await prisma.mensagemProcessada.deleteMany();
  });

  it('grava mensagem processada e outbox na mesma unidade', async () => {
    const eventId = randomUUID();
    const eventoOutbox = randomUUID();

    await uow.executar(async (contexto) => {
      await mensagens.registrar(contexto, eventId, 'hash');
      await outbox.registrar(contexto, {
        eventId: eventoOutbox,
        eventType: 'os.teste.v1',
        envelope: {
          eventId: eventoOutbox,
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
      });
    });

    expect(await prisma.mensagemProcessada.count()).toBe(1);
    expect(await prisma.outboxMensagem.count()).toBe(1);
  });

  it('faz rollback integral se a outbox falhar na mesma transação', async () => {
    const outboxQuebrada: OutboxGateway = {
      registrar: () => Promise.reject(new Error('falha simulada na outbox')),
    };

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        MensageriaModule,
      ],
    })
      .overrideProvider(OUTBOX_GATEWAY)
      .useValue(outboxQuebrada)
      .compile();

    const uowLocal = module.get(PrismaUnitOfWork);
    const mensagensLocal = module.get(PrismaMensagemProcessadaGateway);
    const outboxLocal = module.get(OUTBOX_GATEWAY);

    await expect(
      uowLocal.executar(async (contexto) => {
        await mensagensLocal.registrar(contexto, randomUUID(), 'hash');
        await outboxLocal.registrar(contexto, {
          eventId: randomUUID(),
          eventType: 'os.teste.v1',
          envelope: {} as never,
          correlationId: randomUUID(),
          destino: DESTINO_FILA_BILLING,
        });
      }),
    ).rejects.toThrow('falha simulada');

    expect(await prisma.mensagemProcessada.count()).toBe(0);
    expect(await prisma.outboxMensagem.count()).toBe(0);
    await module.close();
  });
});
