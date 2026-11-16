import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import type { FilaMensagensGateway } from '@/shared/messaging/application/ports/fila-mensagens.gateway';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import type { ProcessadorMensagem } from '@/shared/messaging/application/ports/processador-mensagem.port';
import {
  FILA_MENSAGENS,
  OUTBOX_GATEWAY,
} from '@/shared/messaging/application/ports/tokens';
import { RoteadorProcessadoresMensagemService } from '@/shared/messaging/application/services/roteador-processadores-mensagem.service';
import { ConsumidorFilaOsService } from '@/shared/messaging/infra/consumo/consumidor-fila-os.service';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import {
  DESTINO_FILA_BILLING,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import { EVENTO_TESTE_INTEGRACAO } from './helpers/processador-integracao-mensagem';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';

class ProcessadorTesteConsumo implements ProcessadorMensagem {
  readonly eventType = EVENTO_TESTE_INTEGRACAO;

  constructor(private readonly outbox: OutboxGateway) {}

  async processar(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem<{ marcador: string }>,
  ): Promise<void> {
    const eco: EnvelopeMensagem<{ recebido: string }> = {
      eventId: envelope.payload.marcador,
      eventType: 'mensageria.eco-integracao.v1',
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'os-service',
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      ordemServicoId: envelope.ordemServicoId,
      rodada: envelope.rodada,
      payload: { recebido: envelope.payload.marcador },
    };

    await this.outbox.registrar(contexto, {
      eventId: eco.eventId,
      eventType: eco.eventType,
      envelope: eco,
      correlationId: envelope.correlationId,
      destino: DESTINO_FILA_BILLING,
    });
  }
}
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('Consumidor SQS — idempotência (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let processar: ProcessarMensagemEntradaService;
  const dlq: unknown[] = [];

  class FilaConsumoFake implements FilaMensagensGateway {
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
      dlq.push(envelope);
      return Promise.resolve();
    }
    enviarCorpoBruto(
      _url: string,
      corpo: string,
      _correlationId: string,
    ): Promise<void> {
      void _correlationId;
      dlq.push(corpo);
      return Promise.resolve();
    }
  }

  const correlationId = randomUUID();
  const ordemServicoId = randomUUID();
  const eventId = randomUUID();
  const marcadorEco = randomUUID();

  const envelope = {
    eventId,
    eventType: EVENTO_TESTE_INTEGRACAO,
    version: 1,
    occurredAt: new Date().toISOString(),
    source: 'teste',
    correlationId,
    causationId: null,
    ordemServicoId,
    rodada: 1,
    payload: { marcador: marcadorEco },
  };

  beforeAll(async () => {
    exigirDatabaseUrl();

    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              OUTBOX_PUBLISHER_HABILITADO: 'false',
              SQS_CONSUMER_HABILITADO: 'false',
              SQS_OS_IN_URL: 'https://local/os-in',
              SQS_OS_IN_DLQ_URL: 'https://local/os-in-dlq',
            }),
          ],
        }),
        PrismaModule,
        MensageriaModule,
      ],
    })
      .overrideProvider(FILA_MENSAGENS)
      .useClass(FilaConsumoFake)
      .overrideProvider(RoteadorProcessadoresMensagemService)
      .useFactory({
        factory: (outbox: OutboxGateway) =>
          new RoteadorProcessadoresMensagemService([
            new ProcessadorTesteConsumo(outbox),
          ]),
        inject: [OUTBOX_GATEWAY],
      })
      .compile();

    prisma = nestModule.get(PrismaService);
    processar = nestModule.get(ProcessarMensagemEntradaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  beforeEach(async () => {
    dlq.length = 0;
    await prisma.outboxMensagem.deleteMany();
    await prisma.mensagemProcessada.deleteMany();
  });

  it('mensagem repetida não reaplica efeito', async () => {
    await processar.executar(JSON.stringify(envelope));
    await processar.executar(JSON.stringify(envelope));

    expect(await prisma.mensagemProcessada.count()).toBe(1);
    expect(await prisma.outboxMensagem.count()).toBe(1);
  });

  it('reentrega concorrente não duplica efeito de negócio', async () => {
    await Promise.all([
      processar.executar(JSON.stringify(envelope)),
      processar.executar(JSON.stringify(envelope)),
    ]);

    expect(await prisma.mensagemProcessada.count()).toBe(1);
    expect(await prisma.outboxMensagem.count()).toBe(1);
  });

  it('erro permanente vai para DLQ simulada com corpo idêntico ao recebido', async () => {
    const corpo = JSON.stringify({ eventType: 'invalido' });
    const consumidor = nestModule.get(ConsumidorFilaOsService);
    await consumidor.processarUma(corpo, 'rh');
    expect(dlq).toHaveLength(1);
    expect(dlq[0]).toBe(corpo);
  });

  it('envelope válido na DLQ é reprocessável na os-in com processador registrado', async () => {
    const semProcessador = {
      ...envelope,
      eventId: randomUUID(),
      eventType: 'billing.sem-processador.v1',
    };
    const corpoDlq = JSON.stringify(semProcessador);
    const consumidor = nestModule.get(ConsumidorFilaOsService);
    dlq.length = 0;

    await consumidor.processarUma(corpoDlq, 'rh-dlq');
    expect(dlq[0]).toBe(corpoDlq);

    const reprocessavel = {
      ...envelope,
      eventId: randomUUID(),
      eventType: EVENTO_TESTE_INTEGRACAO,
    };
    const corpoReprocessado = JSON.stringify(reprocessavel);
    await processar.executar(corpoReprocessado);
    expect(await prisma.mensagemProcessada.count()).toBe(1);
  });
});
