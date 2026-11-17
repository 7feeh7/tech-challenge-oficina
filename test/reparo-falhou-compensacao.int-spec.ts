import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
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
  EVENTO_PENDENCIA_RESOLVIDA,
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
import { SessaoBloqueioOrdemServico } from './helpers/sessao-bloqueio-ordem-servico';

const PAUSA_SOBREPOSICAO_MS = 120;

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

  const simularRespostaFinanceiro = (
    osId: string,
    correlationId: string,
    rodada: number,
    resultado: string,
    extra: Record<string, unknown> = {},
    eventId = randomUUID(),
  ) =>
    processar.executar(
      montarEnvelope(
        EVENTO_RESPOSTA_CANCELAMENTO,
        osId,
        correlationId,
        rodada,
        { resultado, ...extra },
        eventId,
      ),
    );

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

  const prepararC2ComDivergencia = async () => {
    const { os, correlationId } = await prepararEmExecucao(4);
    const estoqueAposFalha = (
      await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
    ).quantidadeEstoque;
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
    const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    const pendInv = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.id,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const pendenciaFinanceiraId = `pend-fin-${randomUUID().slice(0, 8)}`;
    await simularRespostaFinanceiro(
      os.id,
      correlationId,
      1,
      'PENDENCIA_MANUAL_ABERTA',
      { pendenciaId: pendenciaFinanceiraId },
    );
    const financeiroEmitido = await contarOutbox(
      correlationId,
      COMANDO_CANCELAR_FINANCEIRO,
    );
    return {
      os,
      correlationId,
      pendInv,
      pendenciaFinanceiraId,
      consumo,
      estoqueAposFalha,
      financeiroEmitido,
    };
  };

  it('C2-A — resolve financeiro antes do inventário', async () => {
    const ctx = await prepararC2ComDivergencia();
    const estado = await prisma.estadoCompensacaoOs.findUniqueOrThrow({
      where: { ordemServicoId: ctx.os.id },
    });
    expect(estado.passo).toBe(PassoCompensacaoSaga.ESTOQUE);
    await processar.executar(
      montarEnvelope(
        EVENTO_PENDENCIA_RESOLVIDA,
        ctx.os.id,
        ctx.correlationId,
        1,
        {
          pendenciaId: ctx.pendenciaFinanceiraId,
        },
      ),
    );
    expect(
      (
        await prisma.ordemServico.findUniqueOrThrow({
          where: { id: ctx.os.id },
        })
      ).status,
    ).toBe(StatusOS.EM_CANCELAMENTO);
    expect(
      await prisma.pendenciaOs.count({
        where: {
          ordemServicoId: ctx.os.id,
          tipo: TipoPendenciaOs.INVENTARIO,
          resolvida: false,
        },
      }),
    ).toBe(1);
    const peca = await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } });
    const estoqueAntesInventario = peca.quantidadeEstoque;
    await ajustar.execute({
      pendenciaId: ctx.pendInv.id,
      pecaId,
      quantidadeFisicaNova: peca.quantidadeEstoque,
      motivo: 'Conferência pós falha',
      responsavelId: randomUUID(),
    });
    expect(
      (
        await prisma.ordemServico.findUniqueOrThrow({
          where: { id: ctx.os.id },
        })
      ).status,
    ).toBe(StatusOS.CANCELADA);
    expect(ctx.consumo.id).toBe(
      (
        await prisma.consumoAplicadoOs.findUniqueOrThrow({
          where: {
            ordemServicoId_rodada: { ordemServicoId: ctx.os.id, rodada: 1 },
          },
        })
      ).id,
    );
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
        .quantidadeEstoque,
    ).toBe(estoqueAntesInventario);
    expect(
      await contarOutbox(ctx.correlationId, COMANDO_CANCELAR_FINANCEIRO),
    ).toBe(ctx.financeiroEmitido);
  });

  it('C2-B — resolve inventário antes do financeiro', async () => {
    const ctx = await prepararC2ComDivergencia();
    const peca = await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } });
    await ajustar.execute({
      pendenciaId: ctx.pendInv.id,
      pecaId,
      quantidadeFisicaNova: peca.quantidadeEstoque,
      motivo: 'Conferência pós falha',
      responsavelId: randomUUID(),
    });
    expect(
      (
        await prisma.ordemServico.findUniqueOrThrow({
          where: { id: ctx.os.id },
        })
      ).status,
    ).toBe(StatusOS.EM_CANCELAMENTO);
    expect(
      await prisma.pendenciaOs.count({
        where: {
          ordemServicoId: ctx.os.id,
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: false,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
    await processar.executar(
      montarEnvelope(
        EVENTO_PENDENCIA_RESOLVIDA,
        ctx.os.id,
        ctx.correlationId,
        1,
        {
          pendenciaId: ctx.pendenciaFinanceiraId,
        },
      ),
    );
    expect(
      (
        await prisma.ordemServico.findUniqueOrThrow({
          where: { id: ctx.os.id },
        })
      ).status,
    ).toBe(StatusOS.CANCELADA);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: ctx.os.id, rodada: 1 },
      }),
    ).toBe(1);
    expect(
      await contarOutbox(ctx.correlationId, COMANDO_CANCELAR_FINANCEIRO),
    ).toBe(ctx.financeiroEmitido);
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

  it('C4 — reentrega compatível não reaplica estoque físico', async () => {
    const { os, correlationId } = await prepararEmExecucao(4);
    const falhouEm = '2026-09-01T10:00:00.000Z';
    const payload = {
      pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
      falhouEm,
    };
    const eventId = randomUUID();
    const estoqueAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
    ).quantidadeEstoque;
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
    const estoqueMeio = (
      await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
    ).quantidadeEstoque;
    expect(estoqueMeio).toBe(estoqueAntes - 2);
    const reservas = await prisma.reservaEstoque.findMany({
      where: { ordemServicoId: os.id, pecaId },
    });
    expect(
      reservas.some((r) => r.situacao === SituacaoReservaEstoque.CONSUMIDA),
    ).toBe(true);
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
  });

  it('C5a — resposta JA_ENCERRADA compatível converge sem reaplicar estoque', async () => {
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
    const estoqueAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
    ).quantidadeEstoque;
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
          situacaoTarefa: 'FALHOU',
          encerradaEm: '2026-07-01T12:00:00.000Z',
          fatoTerminalEventId: eventId,
          motivo: 'falha de teste',
          pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
          servicosRealizados: [],
          divergencias: [],
        },
      ),
    );
    const consumoDepois = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(consumoDepois.id).toBe(consumoAntes.id);
    expect(consumoDepois.eventId).toBe(eventId);
    expect(consumoDepois.fatoOcorridoEm).toEqual(consumoAntes.fatoOcorridoEm);
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
        .quantidadeEstoque,
    ).toBe(estoqueAntes);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      financeiroAntes,
    );
    expect(
      (await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } }))
        .status,
    ).toBe(StatusOS.EM_CANCELAMENTO);
  });

  it('C5b — reentrega compatível do fato não altera auditoria', async () => {
    const { os, correlationId } = await prepararEmExecucao(2);
    const eventId = randomUUID();
    const corpo = montarEnvelope(
      EVENTO_REPARO_FALHOU,
      os.id,
      correlationId,
      1,
      {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
        falhouEm: '2026-08-01T10:00:00.000Z',
      },
      eventId,
    );
    await processar.executar(corpo);
    await processar.executar(corpo);
    const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(consumo.eventId).toBe(eventId);
  });

  async function assertEfeitosC6OrdemUnica(
    osId: string,
    correlationId: string,
    eventId: string,
    estoqueAntes: number,
    qtdConsumida: number,
    reservaQtdOriginal: number,
    falhouEmIso: string,
  ) {
    expect(
      await prisma.historicoStatusOS.count({
        where: { ordemServicoId: osId, statusNovo: StatusOS.EM_CANCELAMENTO },
      }),
    ).toBe(1);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: osId, rodada: 1 },
      }),
    ).toBe(1);
    const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: osId, rodada: 1 } },
    });
    expect(consumo.eventId).toBe(eventId);
    expect(consumo.tipoFato).toBe('REPARO_FALHOU');
    expect(consumo.fatoOcorridoEm.toISOString()).toBe(
      new Date(falhouEmIso).toISOString(),
    );
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
        .quantidadeEstoque,
    ).toBe(estoqueAntes - qtdConsumida);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: osId, pecaId },
    });
    expect(reserva.quantidade).toBe(reservaQtdOriginal);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      1,
    );
    expect(
      await prisma.pendenciaOs.count({
        where: { ordemServicoId: osId, resolvida: false },
      }),
    ).toBe(0);
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: osId },
    });
    expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
    expect(ordem.status).not.toBe(StatusOS.FINALIZADA);
  }

  it('C6-A — ReparoFalhou vence a disputa de bloqueio da OS', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const qtdReserva = 4;
    const qtdConsumida = 1;
    const { os, correlationId } = await prepararEmExecucao(qtdReserva);
    const estoqueAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
    ).quantidadeEstoque;
    const reservaQtdOriginal = (
      await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId },
      })
    ).quantidade;
    const falhouEm = '2026-10-01T10:00:00.000Z';
    const eventId = randomUUID();
    const falhouPayload = {
      pecasUtilizadas: [{ itemId: pecaId, quantidade: qtdConsumida }],
      falhouEm,
    };
    const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
    try {
      await sessao.adquirir();
      const pFalha = processar.executar(
        montarEnvelope(
          EVENTO_REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          falhouPayload,
          eventId,
          falhouEm,
        ),
      );
      const pDesistir = desistir.execute(os.id, {
        motivo: 'C6-A concorrente',
      });
      await new Promise((r) => setTimeout(r, PAUSA_SOBREPOSICAO_MS));
      await sessao.liberar();
      const resultados = await Promise.allSettled([pFalha, pDesistir]);
      expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
      await assertEfeitosC6OrdemUnica(
        os.id,
        correlationId,
        eventId,
        estoqueAntes,
        qtdConsumida,
        reservaQtdOriginal,
        falhouEm,
      );
    } finally {
      await sessao.descartar();
    }
  }, 90_000);

  it('C6-B — desistência vence a disputa; ReparoFalhou reconcilia em seguida', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const qtdReserva = 4;
    const qtdConsumida = 1;
    const { os, correlationId } = await prepararEmExecucao(qtdReserva);
    const estoqueAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
    ).quantidadeEstoque;
    const reservaQtdOriginal = (
      await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId },
      })
    ).quantidade;
    const falhouEm = '2026-10-02T11:00:00.000Z';
    const eventId = randomUUID();
    const falhouPayload = {
      pecasUtilizadas: [{ itemId: pecaId, quantidade: qtdConsumida }],
      falhouEm,
    };
    const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
    try {
      await sessao.adquirir();
      const pDesistir = desistir.execute(os.id, {
        motivo: 'C6-B concorrente',
      });
      const pFalha = processar.executar(
        montarEnvelope(
          EVENTO_REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          falhouPayload,
          eventId,
          falhouEm,
        ),
      );
      await new Promise((r) => setTimeout(r, PAUSA_SOBREPOSICAO_MS));
      await sessao.liberar();
      const resultados = await Promise.allSettled([pDesistir, pFalha]);
      expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
      await assertEfeitosC6OrdemUnica(
        os.id,
        correlationId,
        eventId,
        estoqueAntes,
        qtdConsumida,
        reservaQtdOriginal,
        falhouEm,
      );
    } finally {
      await sessao.descartar();
    }
  }, 90_000);
});
