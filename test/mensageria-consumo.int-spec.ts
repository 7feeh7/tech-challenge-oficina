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
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO } from '@/shared/messaging/envelope';
import { QUANDO_ENCERRAMENTO_E42 } from './helpers/e42-envelope';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { RegistrarDesistenciaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-desistencia.use-case';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import {
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
} from '@/shared/messaging/envelope';

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

describe('Consumidor SQS — resposta cancelamento inválida (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let criarOs: CriarOrdemServicoUseCase;
  let desistir: RegistrarDesistenciaUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;
  const dlq: unknown[] = [];
  const confirmados: string[] = [];
  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let servicoId: string;

  class FilaDlqFake implements FilaMensagensGateway {
    falhaDlq = false;

    receber(): Promise<never[]> {
      return Promise.resolve([]);
    }

    confirmar(_url: string, receiptHandle: string): Promise<void> {
      confirmados.push(receiptHandle);
      return Promise.resolve();
    }

    enviar(): Promise<void> {
      return Promise.reject(new Error('não usar enviar'));
    }

    enviarCorpoBruto(
      _url: string,
      corpo: string,
      correlationId: string,
    ): Promise<void> {
      void correlationId;
      if (this.falhaDlq) {
        return Promise.reject(new Error('DLQ indisponível'));
      }
      dlq.push(corpo);
      return Promise.resolve();
    }
  }

  let fila: FilaDlqFake;

  beforeAll(async () => {
    exigirDatabaseUrl();
    fila = new FilaDlqFake();
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
        ObservabilityModule,
        IdempotencyModule,
        PrismaModule,
        MensageriaModule,
        CoordenacaoSagaModule,
        OrdensServicoModule,
        ReservasEstoqueModule,
        RotasInternasModule,
      ],
    })
      .overrideProvider(FILA_MENSAGENS)
      .useValue(fila)
      .compile();
    prisma = nestModule.get(PrismaService);
    criarOs = nestModule.get(CriarOrdemServicoUseCase);
    desistir = nestModule.get(RegistrarDesistenciaUseCase);
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente DLQ ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '6'),
        email: `dlq-${sufixo}@test.local`,
        telefone: '11922221111',
      },
    });
    clienteId = cliente.id;
    veiculoId = (
      await prisma.veiculo.create({
        data: {
          clienteId,
          placa: `DQ${sufixo.slice(0, 5)}`.padEnd(7, '1').slice(0, 7),
          modelo: 'DLQ',
          marca: 'M',
          ano: 2021,
        },
      })
    ).id;
    servicoId = (
      await prisma.servico.create({
        data: {
          nome: `Srv DLQ ${sufixo}`,
          descricao: 'T',
          precoBase: 80,
          tempoEstimadoMin: 25,
        },
      })
    ).id;
  });

  afterAll(async () => fecharModuloIntegracao(nestModule));

  beforeEach(async () => {
    dlq.length = 0;
    confirmados.length = 0;
    fila.falhaDlq = false;
    await prisma.outboxMensagem.deleteMany();
    await prisma.mensagemProcessada.deleteMany();
  });

  async function montarCorpoInvalidoEmCancelamento() {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: `DLQ ${sufixo}`,
      sugestoes: [],
    });
    const processarEntrada = nestModule.get(ProcessarMensagemEntradaService);
    await processarEntrada.executar(
      JSON.stringify({
        eventId: randomUUID(),
        eventType: EVENTO_DIAGNOSTICO_INICIADO,
        version: 1,
        occurredAt: QUANDO_ENCERRAMENTO_E42,
        source: 'teste',
        correlationId: os.correlationId,
        causationId: null,
        ordemServicoId: os.id,
        rodada: 1,
        payload: { tarefaId: `${os.id}#1#DIAGNOSTICO` },
      }),
    );
    await concluirDiagnostico.execute({
      ordemServicoId: os.id,
      rodada: 1,
      tarefaId: `${os.id}#1#DIAGNOSTICO`,
      laudo: 'Laudo',
      itens: [{ tipo: 'SERVICO', itemId: servicoId, quantidade: 1 }],
      idempotencyKey: randomUUID(),
    });
    await processarEntrada.executar(
      JSON.stringify({
        eventId: randomUUID(),
        eventType: EVENTO_ORCAMENTO_GERADO,
        version: 1,
        occurredAt: QUANDO_ENCERRAMENTO_E42,
        source: 'teste',
        correlationId: os.correlationId,
        causationId: null,
        ordemServicoId: os.id,
        rodada: 1,
        payload: { orcamentoId: randomUUID(), valorTotalCentavos: 5000 },
      }),
    );
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      orcamentoId: randomUUID(),
      idempotencyKey: randomUUID(),
    });
    await desistir.execute(os.id, { motivo: 'DLQ estrutural' });
    return JSON.stringify({
      eventId: randomUUID(),
      eventType: EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
      version: 1,
      occurredAt: QUANDO_ENCERRAMENTO_E42,
      source: 'execution',
      correlationId: os.correlationId,
      causationId: null,
      ordemServicoId: os.id,
      rodada: 1,
      payload: {
        tipoTarefa: 'DIAGNOSTICO',
        resultado: 'JA_CONCLUIDA',
        situacaoTarefa: 'CONCLUIDA',
        concluidaEm: QUANDO_ENCERRAMENTO_E42,
        encerradaEm: QUANDO_ENCERRAMENTO_E42,
        pecasUtilizadas: [{ itemId: randomUUID(), quantidade: 1 }],
        servicosRealizados: [],
        divergencias: [],
      },
    });
  }

  it('resposta estruturalmente inválida vai à DLQ sem efeito de negócio', async () => {
    const consumidor = nestModule.get(ConsumidorFilaOsService);
    const peca = await prisma.peca.findFirst();
    const estoqueAntes = peca?.quantidadeEstoque ?? null;
    const corpoDiagnosticoComListas = await montarCorpoInvalidoEmCancelamento();
    const envelopeInvalido = JSON.parse(corpoDiagnosticoComListas) as {
      eventId: string;
      ordemServicoId: string;
    };
    await consumidor.processarUma(corpoDiagnosticoComListas, 'rh-invalido');
    expect(dlq).toHaveLength(1);
    expect(dlq[0]).toBe(corpoDiagnosticoComListas);
    expect(confirmados).toEqual(['rh-invalido']);
    expect(
      await prisma.mensagemProcessada.count({
        where: { eventId: envelopeInvalido.eventId },
      }),
    ).toBe(0);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: envelopeInvalido.ordemServicoId },
      }),
    ).toBe(0);
    expect(
      await prisma.pendenciaOs.count({
        where: { ordemServicoId: envelopeInvalido.ordemServicoId },
      }),
    ).toBe(0);
    if (peca && estoqueAntes !== null) {
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
          .quantidadeEstoque,
      ).toBe(estoqueAntes);
    }
  });

  it('falha ao enviar à DLQ não confirma a mensagem original', async () => {
    fila.falhaDlq = true;
    const consumidor = nestModule.get(ConsumidorFilaOsService);
    const corpoDiagnosticoComListas = await montarCorpoInvalidoEmCancelamento();
    await consumidor.processarUma(corpoDiagnosticoComListas, 'rh-sem-dlq');
    expect(dlq).toHaveLength(0);
    expect(confirmados).toHaveLength(0);
  });
});
