import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/shared/generated/prisma/client';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { RegistrarDesistenciaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-desistencia.use-case';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { AjustarEstoqueDivergenciaUseCase } from '@/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_FALHOU,
  EVENTO_REPARO_INICIADO,
  EVENTO_RESPOSTA_CANCELAMENTO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import {
  PassoCompensacaoSaga,
  SituacaoReservaEstoque,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

function criarPrismaPool(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 15_000,
  });
  return new PrismaClient({ adapter });
}

describe('Compensação — ReparoFalhou (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let processar: ProcessarMensagemEntradaService;
  let criarOs: CriarOrdemServicoUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;
  let ajustar: AjustarEstoqueDivergenciaUseCase;
  let desistir: RegistrarDesistenciaUseCase;

  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let pecaId: string;
  let servicoId: string;

  const montarEnvelope = (
    eventType: string,
    ordemServicoId: string,
    correlationId: string,
    rodada: number,
    payload: Record<string, unknown>,
    eventId = randomUUID(),
    occurredAt?: string,
  ) =>
    JSON.stringify({
      eventId,
      eventType,
      version: 1,
      occurredAt: occurredAt ?? new Date().toISOString(),
      source: 'teste-falha',
      correlationId,
      causationId: null,
      ordemServicoId,
      rodada,
      payload,
    });

  const contarOutbox = (correlationId: string, eventType: string) =>
    prisma.outboxMensagem.count({ where: { correlationId, eventType } });

  const prepararAguardandoExecucao = async (pecaQtd = 4) => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: `Falha ${sufixo}`,
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: pecaQtd }],
    });
    const correlationId = os.correlationId;
    await processar.executar(
      montarEnvelope(EVENTO_DIAGNOSTICO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#DIAGNOSTICO`,
      }),
    );
    await concluirDiagnostico.execute({
      ordemServicoId: os.id,
      rodada: 1,
      tarefaId: `${os.id}#1#DIAGNOSTICO`,
      laudo: 'Laudo',
      itens: [
        { tipo: 'SERVICO', itemId: servicoId, quantidade: 1 },
        { tipo: 'PECA', itemId: pecaId, quantidade: pecaQtd },
      ],
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelope(EVENTO_ORCAMENTO_GERADO, os.id, correlationId, 1, {
        orcamentoId: randomUUID(),
        valorTotalCentavos: 40000,
      }),
    );
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      orcamentoId: randomUUID(),
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId: `ORD-FL-${sufixo}`,
        valorCentavos: 40000,
      }),
    );
    return { os, correlationId };
  };

  const prepararEmExecucao = async (pecaQtd = 4) => {
    const { os, correlationId } = await prepararAguardandoExecucao(pecaQtd);
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#REPARO`,
      }),
    );
    return { os, correlationId };
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
    }).compile();

    prisma = nestModule.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    processar = nestModule.get(ProcessarMensagemEntradaService);
    criarOs = nestModule.get(CriarOrdemServicoUseCase);
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);
    ajustar = nestModule.get(AjustarEstoqueDivergenciaUseCase);
    desistir = nestModule.get(RegistrarDesistenciaUseCase);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente falha ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '4'),
        email: `fl-${sufixo}@test.local`,
        telefone: '11988887777',
      },
    });
    clienteId = cliente.id;
    veiculoId = (
      await prisma.veiculo.create({
        data: {
          clienteId,
          placa: `FL${sufixo.slice(0, 5)}2`.padEnd(7, '2').slice(0, 7),
          modelo: 'Teste',
          marca: 'Marca',
          ano: 2022,
        },
      })
    ).id;
    pecaId = (
      await prisma.peca.create({
        data: {
          codigo: `P-FL-${sufixo}`,
          nome: 'Peça falha',
          precoUnitario: 30,
          quantidadeEstoque: 80,
        },
      })
    ).id;
    servicoId = (
      await prisma.servico.create({
        data: {
          nome: `Srv fl ${sufixo}`,
          descricao: 'T',
          precoBase: 120,
          tempoEstimadoMin: 30,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  it('C1 — falha com consumo conciliável em EM_EXECUCAO inicia compensação', async () => {
    const { os, correlationId } = await prepararEmExecucao(4);
    const falhouEm = '2026-05-10T16:20:00.000Z';
    const eventId = randomUUID();
    await processar.executar(
      montarEnvelope(
        EVENTO_REPARO_FALHOU,
        os.id,
        correlationId,
        1,
        {
          pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
          responsavelId: 'sub|mec-falha',
          falhouEm,
        },
        eventId,
        falhouEm,
      ),
    );
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
    expect(ordem.etapaOrigemCancelamento).toBe(StatusOS.EM_EXECUCAO);
    expect(ordem.motivoEncerramento).toBe('Falha do reparo');
    expect(ordem.status).not.toBe(StatusOS.FINALIZADA);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_TAREFA)).toBe(0);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      1,
    );
    const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(consumo.tipoFato).toBe('REPARO_FALHOU');
    expect(consumo.fatoOcorridoEm.toISOString()).toBe(
      new Date(falhouEm).toISOString(),
    );
    expect(consumo.responsavelId).toBe('sub|mec-falha');
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
    const reservas = await prisma.reservaEstoque.findMany({
      where: { ordemServicoId: os.id, pecaId },
    });
    expect(
      reservas.some((r) => r.situacao === SituacaoReservaEstoque.CONSUMIDA),
    ).toBe(true);
    expect(
      reservas.filter((r) => r.situacao === SituacaoReservaEstoque.ATIVA)
        .length,
    ).toBe(0);
    const estado = await prisma.estadoCompensacaoOs.findUniqueOrThrow({
      where: { ordemServicoId: os.id },
    });
    expect(estado.fatoTerminalExecucao).toBe(true);
    expect(estado.resultadoExecucao).toBe('REPARO_INICIADO');
  });

  it('C2 — falha com divergência resolve inventário sem FINALIZADA', async () => {
    const { os, correlationId } = await prepararEmExecucao(4);
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_FALHOU, os.id, correlationId, 1, {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 9 }],
        divergencias: [
          {
            itemId: pecaId,
            tipo: 'CONSUMO_ACIMA',
            quantidadePrevista: 4,
            quantidadeUtilizada: 9,
            justificativa: 'Peça extra queimada',
          },
        ],
        responsavelId: 'sub|div',
        falhouEm: new Date().toISOString(),
      }),
    );
    const pendInv = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.id,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const peca = await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } });
    await ajustar.execute({
      pendenciaId: pendInv.id,
      pecaId,
      quantidadeFisicaNova: peca.quantidadeEstoque,
      motivo: 'Conferência pós falha',
      responsavelId: randomUUID(),
    });
    const ordemAposInv = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordemAposInv.status).toBe(StatusOS.EM_CANCELAMENTO);
    expect(ordemAposInv.status).not.toBe(StatusOS.FINALIZADA);
    await processar.executar(
      montarEnvelope(EVENTO_RESPOSTA_CANCELAMENTO, os.id, correlationId, 1, {
        resultado: 'ESTORNADA',
      }),
    );
    const ordemFinal = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect([StatusOS.CANCELADA, StatusOS.EM_CANCELAMENTO]).toContain(
      ordemFinal.status,
    );
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
  });

  it('C3 — falha em AGUARDANDO_EXECUCAO persiste consumo e compensação', async () => {
    const { os, correlationId } = await prepararAguardandoExecucao(3);
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_FALHOU, os.id, correlationId, 1, {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
        falhouEm: '2026-06-01T11:00:00.000Z',
      }),
    );
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
    expect(ordem.etapaOrigemCancelamento).toBe(StatusOS.AGUARDANDO_EXECUCAO);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
    const estado = await prisma.estadoCompensacaoOs.findUniqueOrThrow({
      where: { ordemServicoId: os.id },
    });
    expect(estado.fatoTerminalExecucao).toBe(true);
    expect(estado.passo).not.toBe(PassoCompensacaoSaga.CONCLUIDO);
  });

  it('C4 — reentrega não duplica consumo nem comando financeiro', async () => {
    const { os, correlationId } = await prepararEmExecucao(4);
    const falhouEm = '2026-09-01T10:00:00.000Z';
    const payload = {
      pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
      falhouEm,
    };
    const eventId = randomUUID();
    const corpo = montarEnvelope(
      EVENTO_REPARO_FALHOU,
      os.id,
      correlationId,
      1,
      payload,
      eventId,
      falhouEm,
    );
    await processar.executar(corpo);
    await processar.executar(corpo);
    await processar.executar(
      montarEnvelope(
        EVENTO_REPARO_FALHOU,
        os.id,
        correlationId,
        1,
        payload,
        randomUUID(),
        falhouEm,
      ),
    );
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
    expect(
      await prisma.historicoStatusOS.count({
        where: { ordemServicoId: os.id, statusNovo: StatusOS.EM_CANCELAMENTO },
      }),
    ).toBe(1);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      1,
    );
    expect(
      await prisma.pendenciaOs.count({
        where: { ordemServicoId: os.id, tipo: TipoPendenciaOs.INVENTARIO },
      }),
    ).toBeLessThanOrEqual(1);
  });

  it('C5 — resposta JA_ENCERRADA atrasada não regressa estado', async () => {
    const { os, correlationId } = await prepararEmExecucao(4);
    const eventId = randomUUID();
    await processar.executar(
      montarEnvelope(
        EVENTO_REPARO_FALHOU,
        os.id,
        correlationId,
        1,
        {
          pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
          falhouEm: '2026-07-01T12:00:00.000Z',
        },
        eventId,
      ),
    );
    const consumoAntes = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    const financeiroAntes = await contarOutbox(
      correlationId,
      COMANDO_CANCELAR_FINANCEIRO,
    );
    await processar.executar(
      montarEnvelope(
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        os.id,
        correlationId,
        1,
        {
          tipoTarefa: 'REPARO',
          resultado: 'JA_ENCERRADA',
        },
      ),
    );
    const consumoDepois = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(consumoDepois.id).toBe(consumoAntes.id);
    expect(consumoDepois.fatoOcorridoEm).toEqual(consumoAntes.fatoOcorridoEm);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      financeiroAntes,
    );
    expect(
      (await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } }))
        .status,
    ).toBe(StatusOS.EM_CANCELAMENTO);
  });

  it('C6 — concorrência desistência e ReparoFalhou mantém efeito único', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const { os, correlationId } = await prepararEmExecucao(4);
    const falhouPayload = {
      pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
      falhouEm: new Date().toISOString(),
    };
    const prismaB = criarPrismaPool(databaseUrl);
    const processarB = processar;
    let trava = 0;
    const liberar = new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        trava += 1;
        if (trava >= 2) {
          clearInterval(iv);
          resolve();
        }
      }, 15);
    });
    const pDesistir = (async () => {
      await liberar;
      return desistir.execute(os.id, { motivo: 'Concorrência desistência' });
    })();
    const pFalha = (async () => {
      await liberar;
      return processarB.executar(
        montarEnvelope(
          EVENTO_REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          falhouPayload,
        ),
      );
    })();
    await Promise.allSettled([pDesistir, pFalha]);
    await prismaB.$disconnect();
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBeLessThanOrEqual(1);
    expect(
      await prisma.historicoStatusOS.count({
        where: { ordemServicoId: os.id, statusNovo: StatusOS.EM_CANCELAMENTO },
      }),
    ).toBeLessThanOrEqual(1);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      1,
    );
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).not.toBe(StatusOS.FINALIZADA);
  }, 60_000);
});
