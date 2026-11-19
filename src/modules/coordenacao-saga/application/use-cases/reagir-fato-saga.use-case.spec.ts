import { criarOrdemFake } from '@/modules/ordens-servico/application/use-cases/test-doubles';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  ConsumoAplicadoIncompativelError,
  ReservaJaProcessadaError,
} from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import {
  EVENTO_ESTORNO_CONCLUIDO,
  EVENTO_PAGAMENTO_TARDIO_REGISTRADO,
  EVENTO_REPARO_INTERROMPIDO,
} from '@/shared/messaging/envelope';
import {
  EVENTO_COBRANCA_CRIADA,
  EVENTO_COBRANCA_EXPIRADA,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_ORCAMENTO_REJEITADO,
  EVENTO_TAREFA_DEVOLVIDA_A_FILA,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_SITUACAO_FINANCEIRA,
  EVENTO_PENDENCIA_RESOLVIDA,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_FALHOU,
  EVENTO_REPARO_INICIADO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { PassoCompensacaoSaga } from '@/shared/generated/prisma/enums';
import { ReagirFatoSagaUseCase } from './reagir-fato-saga.use-case';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

const contexto = { __contextoTransacao: Symbol() } as ContextoTransacao;

describe('ReagirFatoSagaUseCase', () => {
  const logger = { logWithMeta: jest.fn() };

  const montarUseCase = (status: StatusOS) => {
    const ordem = criarOrdemFake({
      status,
      correlationId: 'corr-1',
    });
    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem,
        cliente: { id: 'c1', nome: 'A', email: 'a@b.com' },
        veiculo: { placa: 'ABC', modelo: 'X' },
      }),
    };
    const transicoes = {
      aplicar: jest.fn().mockResolvedValue({
        mudouStatus: true,
        eventId: 'ev-1',
        bloqueada: {
          ordem,
          cliente: { id: 'c1', nome: 'A', email: 'a@b.com' },
          veiculo: { placa: 'ABC', modelo: 'X' },
        },
      }),
      salvarSobBloqueio: jest.fn(),
      registrarIniciarReparoNaOutbox: jest.fn().mockResolvedValue('pedido-1'),
    };
    const consumirReserva = { execute: jest.fn() };
    const reservas = {
      possuiConsumoAplicado: jest.fn(),
      possuiConsumoAplicadoNaRodada: jest.fn(),
    };
    const pedidos = {
      registrar: jest.fn(),
      marcarConcluidoPorTipo: jest.fn(),
    };
    const projecao = {
      buscarOrdersPagas: jest.fn().mockResolvedValue([]),
      registrarCobranca: jest.fn().mockResolvedValue('criado'),
      registrarPagamento: jest.fn().mockResolvedValue('criado'),
      registrarOrcamento: jest.fn().mockResolvedValue('criado'),
      jaNotificouPagamentoDisponivel: jest.fn().mockResolvedValue(false),
    };
    const prisma = {
      pendenciaOs: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      projecaoFinanceiraOs: { updateMany: jest.fn() },
    };
    const compensacao = {
      avancarAposEntradaEmCancelamento: jest.fn(),
      avancarSeEmCancelamento: jest.fn(),
      registrarReparoIniciadoDuranteCancelamento: jest.fn(),
      tratarRespostaCancelamento: jest.fn(),
      tratarRespostaCancelamentoFinanceiro: jest.fn(),
      tratarSituacaoFinanceiraE10: jest.fn(),
      registrarFatoTerminalExecucao: jest.fn(),
    };
    const estadoCompensacao = {
      obterOuCriar: jest.fn().mockResolvedValue({
        consultaIdVigente: null,
        passo: 'EXECUCAO',
      }),
      salvar: jest.fn(),
    };
    const outbox = { registrar: jest.fn() };
    const consultaPrazo = { agendarProximaReconsulta: jest.fn() };
    const osMetrics = { recordSituacaoFinanceiraIndeterminada: jest.fn() };
    const reconciliacao = {
      reconciliarFatoTerminal: jest
        .fn()
        .mockImplementation(
          async (
            ctx: ContextoTransacao,
            ordemServicoId: string,
            rodada: number,
            ctxFato: unknown,
            pecas: { itemId: string; quantidade: number }[],
            _p: unknown,
            _motivo: unknown,
            idempotencyKey: string,
          ) => {
            try {
              const consumo = await consumirReserva.execute(
                {
                  ordemServicoId,
                  rodada,
                  itensUtilizados: pecas.map((p) => ({
                    pecaId: p.itemId,
                    quantidade: p.quantidade,
                  })),
                  idempotencyKey,
                  contextoFato: ctxFato,
                },
                ctx,
              );
              return consumo.impedimentoInventario
                ? 'impedimento_inventario'
                : consumo.reutilizado
                  ? 'reutilizado'
                  : 'aplicado';
            } catch (erro) {
              if (erro instanceof ReservaJaProcessadaError) {
                const naRodada = await reservas.possuiConsumoAplicadoNaRodada(
                  ctx,
                  ordemServicoId,
                  rodada,
                );
                const legado = await reservas.possuiConsumoAplicado(
                  ctx,
                  ordemServicoId,
                  rodada,
                  pecas.map((p) => p.itemId),
                );
                if (naRodada || legado) {
                  return 'reutilizado';
                }
              }
              throw erro;
            }
          },
        ),
      resolverPendenciaInformacaoInsuficienteSeCausaEliminada: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const useCase = new ReagirFatoSagaUseCase(
      ordens as never,
      transicoes as never,
      consumirReserva as never,
      reservas as never,
      pedidos,
      projecao as never,
      logger as never,
      prisma as never,
      compensacao as never,
      estadoCompensacao,
      outbox,
      consultaPrazo as never,
      osMetrics as never,
      reconciliacao as never,
    );
    return {
      useCase,
      transicoes,
      projecao,
      consumirReserva,
      reservas,
      ordens,
      pedidos,
      compensacao,
      consultaPrazo,
      osMetrics,
      outbox,
      estadoCompensacao,
      prisma,
      reconciliacao,
    };
  };

  it('registra DiagnosticoIniciado na rodada 2 sem mudar status', async () => {
    const ordem = criarOrdemFake({
      status: StatusOS.EM_DIAGNOSTICO,
      rodadaVigente: 2,
      correlationId: 'corr-1',
    });
    const { useCase, transicoes, ordens } = montarUseCase(
      StatusOS.EM_DIAGNOSTICO,
    );
    ordens.bloquearParaAtualizacao.mockResolvedValue({
      ordem,
      cliente: { id: 'c1', nome: 'A', email: 'a@b.com' },
      veiculo: { placa: 'ABC', modelo: 'X' },
    });
    await useCase.executar(contexto, {
      eventId: 'e0',
      eventType: EVENTO_DIAGNOSTICO_INICIADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 2,
      payload: {},
    });
    expect(transicoes.salvarSobBloqueio).toHaveBeenCalled();
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('concilia pagamento fora de AGUARDANDO_PAGAMENTO sem transição', async () => {
    const { useCase, transicoes, projecao } = montarUseCase(
      StatusOS.EM_DIAGNOSTICO,
    );
    await useCase.executar(contexto, {
      eventId: 'e1',
      eventType: EVENTO_PAGAMENTO_CONFIRMADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { orderId: 'ORD-1', valorCentavos: 100 },
    });
    expect(projecao.registrarPagamento).toHaveBeenCalled();
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('emite IniciarReparo ao confirmar pagamento em AGUARDANDO_PAGAMENTO', async () => {
    const { useCase, transicoes, pedidos } = montarUseCase(
      StatusOS.AGUARDANDO_PAGAMENTO,
    );
    await useCase.executar(contexto, {
      eventId: 'e3',
      eventType: EVENTO_PAGAMENTO_CONFIRMADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { orderId: 'ORD-1', valorCentavos: 100 },
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
    expect(transicoes.registrarIniciarReparoNaOutbox).toHaveBeenCalled();
    expect(pedidos.registrar).toHaveBeenCalled();
  });

  it('mantém EM_EXECUCAO quando consumo gera divergência', async () => {
    const { useCase, consumirReserva, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      divergencias: [{ pecaId: 'p1' }],
      pendenciaInventarioId: 'pend-1',
      impedimentoInventario: true,
      reutilizado: false,
    });
    await useCase.executar(contexto, {
      eventId: 'e4',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('reentrega com ReservaJaProcessada e registro na rodada segue sem erro', async () => {
    const { useCase, consumirReserva, reservas, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest
      .fn()
      .mockRejectedValue(new ReservaJaProcessadaError());
    reservas.possuiConsumoAplicadoNaRodada = jest.fn().mockResolvedValue(true);
    reservas.possuiConsumoAplicado = jest.fn().mockResolvedValue(false);
    await useCase.executar(contexto, {
      eventId: 'e-retry',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('reentrega ReservaJaProcessada usa legado CONSUMIDA quando não há registro', async () => {
    const { useCase, consumirReserva, reservas, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest
      .fn()
      .mockRejectedValue(new ReservaJaProcessadaError());
    reservas.possuiConsumoAplicadoNaRodada = jest.fn().mockResolvedValue(false);
    reservas.possuiConsumoAplicado = jest.fn().mockResolvedValue(true);
    await useCase.executar(contexto, {
      eventId: 'e-leg',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(reservas.possuiConsumoAplicado).toHaveBeenCalled();
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('reentrega com consumo reutilizado e impedimento não finaliza', async () => {
    const { useCase, consumirReserva, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      divergencias: [{ pecaId: 'p1' }],
      impedimentoInventario: true,
      reutilizado: true,
    });
    await useCase.executar(contexto, {
      eventId: 'e-imp-reuse',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('finaliza quando consumo já estava CONSUMIDA', async () => {
    const { useCase, consumirReserva, reservas, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest
      .fn()
      .mockRejectedValue(new ReservaJaProcessadaError());
    reservas.possuiConsumoAplicadoNaRodada = jest.fn().mockResolvedValue(true);
    reservas.possuiConsumoAplicado = jest.fn().mockResolvedValue(false);
    await useCase.executar(contexto, {
      eventId: 'e5',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('ignora fato com log quando decidir retorna IGNORAR', async () => {
    const { useCase, transicoes } = montarUseCase(StatusOS.FINALIZADA);
    await useCase.executar(contexto, {
      eventId: 'e6',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [] },
    });
    expect(logger.logWithMeta).toHaveBeenCalledWith(
      'info',
      'saga.fato.ignorado',
      expect.any(Object),
      'CoordenacaoSaga',
    );
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('inicia compensação em CobrancaExpirada', async () => {
    const { useCase, transicoes, compensacao } = montarUseCase(
      StatusOS.AGUARDANDO_PAGAMENTO,
    );
    transicoes.aplicar.mockResolvedValue({
      mudouStatus: true,
      eventId: 'ev-exp',
    });
    await useCase.executar(contexto, {
      eventId: 'e-exp',
      eventType: EVENTO_COBRANCA_EXPIRADA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {},
    });
    expect(compensacao.avancarAposEntradaEmCancelamento).toHaveBeenCalled();
  });

  it('delega RESPOSTA_CANCELAMENTO à compensação', async () => {
    const { useCase, compensacao } = montarUseCase(StatusOS.EM_CANCELAMENTO);
    await useCase.executar(contexto, {
      eventId: 'e-resp',
      eventType: EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {
        tipoTarefa: 'DIAGNOSTICO',
        resultado: 'CANCELADA_SEM_INICIO',
      },
    });
    expect(compensacao.tratarRespostaCancelamento).toHaveBeenCalled();
  });

  it('concilia pagamento em EM_CANCELAMENTO e avança compensação', async () => {
    const { useCase, compensacao, projecao } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    await useCase.executar(contexto, {
      eventId: 'e-pag',
      eventType: EVENTO_PAGAMENTO_CONFIRMADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { orderId: 'ORD-1' },
    });
    expect(projecao.registrarPagamento).toHaveBeenCalled();
    expect(compensacao.avancarSeEmCancelamento).toHaveBeenCalled();
  });

  it('registra reparo iniciado durante cancelamento sem transição', async () => {
    const { useCase, compensacao, transicoes } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    await useCase.executar(contexto, {
      eventId: 'e-rep',
      eventType: EVENTO_REPARO_INICIADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {},
    });
    expect(
      compensacao.registrarReparoIniciadoDuranteCancelamento,
    ).toHaveBeenCalled();
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('PAGO_NO_PRAZO na consulta de prazo confirma pagamento', async () => {
    const { useCase, transicoes, estadoCompensacao, pedidos } = montarUseCase(
      StatusOS.AGUARDANDO_PAGAMENTO,
    );
    estadoCompensacao.obterOuCriar = jest.fn().mockResolvedValue({
      consultaIdVigente: 'c1',
      passo: 'EXECUCAO',
    });
    transicoes.aplicar.mockResolvedValue({
      mudouStatus: true,
      eventId: 'ev-pago-prazo',
      bloqueada: {
        ordem: criarOrdemFake({ status: StatusOS.AGUARDANDO_EXECUCAO }),
        cliente: { id: 'c1', nome: 'A', email: 'a@b.com' },
        veiculo: { placa: 'ABC', modelo: 'X' },
      },
    });
    await useCase.executar(contexto, {
      eventId: 'e-sit',
      eventType: EVENTO_SITUACAO_FINANCEIRA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {
        consultaId: 'c1',
        situacaoPagamento: 'PAGO_NO_PRAZO',
        orderId: 'ORD',
        cobrancaId: 'cob-1',
        valorCentavos: 900,
      },
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
    expect(pedidos.registrar).toHaveBeenCalled();
  });

  it('SituacaoFinanceira em EM_CANCELAMENTO delega à compensação E10', async () => {
    const { useCase, compensacao, estadoCompensacao } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    estadoCompensacao.obterOuCriar = jest.fn().mockResolvedValue({
      consultaIdVigente: 'c1',
      passo: PassoCompensacaoSaga.CONSULTA_E10,
    });
    await useCase.executar(contexto, {
      eventId: 'e-sit-e10',
      eventType: EVENTO_SITUACAO_FINANCEIRA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {
        consultaId: 'c1',
        situacaoPagamento: 'SEM_PAGAMENTO',
      },
    });
    expect(compensacao.tratarSituacaoFinanceiraE10).toHaveBeenCalled();
  });

  it('INDETERMINADA na consulta de prazo agenda reconsulta e métrica', async () => {
    const { useCase, consultaPrazo, osMetrics, estadoCompensacao } =
      montarUseCase(StatusOS.AGUARDANDO_PAGAMENTO);
    estadoCompensacao.obterOuCriar = jest.fn().mockResolvedValue({
      consultaIdVigente: 'c1',
      passo: 'EXECUCAO',
    });
    await useCase.executar(contexto, {
      eventId: 'e-sit',
      eventType: EVENTO_SITUACAO_FINANCEIRA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { consultaId: 'c1', situacaoPagamento: 'INDETERMINADA' },
    });
    expect(consultaPrazo.agendarProximaReconsulta).toHaveBeenCalled();
    expect(osMetrics.recordSituacaoFinanceiraIndeterminada).toHaveBeenCalled();
  });

  it('SEM_PAGAMENTO na consulta de prazo inicia compensação', async () => {
    const { useCase, compensacao, estadoCompensacao } = montarUseCase(
      StatusOS.AGUARDANDO_PAGAMENTO,
    );
    estadoCompensacao.obterOuCriar = jest.fn().mockResolvedValue({
      consultaIdVigente: 'c1',
      passo: 'EXECUCAO',
    });
    await useCase.executar(contexto, {
      eventId: 'e-sit',
      eventType: EVENTO_SITUACAO_FINANCEIRA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { consultaId: 'c1', situacaoPagamento: 'SEM_PAGAMENTO' },
    });
    expect(compensacao.avancarAposEntradaEmCancelamento).toHaveBeenCalled();
  });

  it('CobrancaCriada publica pagamento disponível quando link é novo', async () => {
    const { useCase, projecao, outbox, prisma } = montarUseCase(
      StatusOS.AGUARDANDO_PAGAMENTO,
    );
    projecao.registrarCobranca = jest.fn().mockResolvedValue('criado');
    projecao.jaNotificouPagamentoDisponivel = jest
      .fn()
      .mockResolvedValue(false);
    await useCase.executar(contexto, {
      eventId: 'e-cob-novo',
      eventType: EVENTO_COBRANCA_CRIADA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {
        orderId: 'ORD',
        linkPagamento: 'https://pay.example',
        valorCentavos: 1500,
      },
    });
    expect(outbox.registrar).toHaveBeenCalled();
    expect(prisma.projecaoFinanceiraOs.updateMany).toHaveBeenCalled();
  });

  it('CobrancaCriada não republica pagamento disponível se já notificado', async () => {
    const { useCase, projecao, outbox } = montarUseCase(
      StatusOS.AGUARDANDO_PAGAMENTO,
    );
    projecao.registrarCobranca = jest.fn().mockResolvedValue('duplicado');
    projecao.jaNotificouPagamentoDisponivel = jest.fn().mockResolvedValue(true);
    await useCase.executar(contexto, {
      eventId: 'e-cob',
      eventType: EVENTO_COBRANCA_CRIADA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { orderId: 'ORD', linkPagamento: 'https://x' },
    });
    expect(outbox.registrar).not.toHaveBeenCalled();
  });

  it('resolve pendência financeira correspondente em EM_CANCELAMENTO', async () => {
    const { useCase, prisma, compensacao } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    prisma.pendenciaOs.findMany = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        detalhes: { cobrancaId: 'cob-a' },
      },
      {
        id: 'p2',
        detalhes: { cobrancaId: 'cob-b' },
      },
    ]);
    await useCase.executar(contexto, {
      eventId: 'e-pend',
      eventType: EVENTO_PENDENCIA_RESOLVIDA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { cobrancaId: 'cob-a' },
    });
    expect(prisma.pendenciaOs.update).toHaveBeenCalledTimes(1);
    expect(compensacao.avancarSeEmCancelamento).toHaveBeenCalled();
  });

  it('PendenciaResolvida sem alvo não atualiza pendências', async () => {
    const { useCase, prisma, compensacao } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    prisma.pendenciaOs.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'p1', detalhes: { cobrancaId: 'cob-x' } }]);
    await useCase.executar(contexto, {
      eventId: 'e-pend-miss',
      eventType: EVENTO_PENDENCIA_RESOLVIDA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { cobrancaId: 'cob-outro' },
    });
    expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    expect(compensacao.avancarSeEmCancelamento).not.toHaveBeenCalled();
  });

  it('registra projeção ao receber OrcamentoGerado', async () => {
    const { useCase, projecao } = montarUseCase(StatusOS.EM_DIAGNOSTICO);
    await useCase.executar(contexto, {
      eventId: 'e-orc',
      eventType: EVENTO_ORCAMENTO_GERADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { orcamentoId: 'orc-1', valorTotalCentavos: 1000 },
    });
    expect(projecao.registrarOrcamento).toHaveBeenCalled();
  });

  it('não trata ReservaJaProcessadaError como sucesso sem CONSUMIDA', async () => {
    const { useCase, consumirReserva, reservas, ordens } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest
      .fn()
      .mockRejectedValue(new ReservaJaProcessadaError());
    reservas.possuiConsumoAplicado = jest.fn().mockResolvedValue(false);

    await expect(
      useCase.executar(contexto, {
        eventId: 'e2',
        eventType: EVENTO_REPARO_CONCLUIDO,
        version: 1,
        occurredAt: new Date().toISOString(),
        source: 'execution',
        correlationId: 'corr-1',
        causationId: null,
        ordemServicoId: 'uuid-os1',
        rodada: 1,
        payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
      }),
    ).rejects.toBeInstanceOf(ReservaJaProcessadaError);
    expect(ordens.bloquearParaAtualizacao).toHaveBeenCalled();
  });

  it('reparo-falhou com consumo existente reconcilia sem nova transição', async () => {
    const { useCase, reconciliacao, transicoes } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    reconciliacao.reconciliarFatoTerminal = jest
      .fn()
      .mockResolvedValue('reutilizado');
    await useCase.executar(contexto, {
      eventId: 'falha-idem',
      eventType: EVENTO_REPARO_FALHOU,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(reconciliacao.reconciliarFatoTerminal).toHaveBeenCalled();
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('reparo-falhou aplica consumo efetivo antes da compensação', async () => {
    const { useCase, consumirReserva, compensacao } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      divergencias: [],
      impedimentoInventario: false,
      reutilizado: false,
    });
    await useCase.executar(contexto, {
      eventId: 'falha-1',
      eventType: EVENTO_REPARO_FALHOU,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {
        responsavelId: 'sub-mec',
        pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }],
      },
    });
    expect(consumirReserva.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        contextoFato: expect.objectContaining({
          tipoFato: 'REPARO_FALHOU',
          responsavelId: 'sub-mec',
        }),
      }),
      contexto,
    );
    expect(compensacao.registrarFatoTerminalExecucao).toHaveBeenCalled();
  });

  it('lança quando OS não existe no bloqueio', async () => {
    const { useCase, ordens } = montarUseCase(StatusOS.EM_EXECUCAO);
    ordens.bloquearParaAtualizacao.mockResolvedValue(null);
    await expect(
      useCase.executar(contexto, {
        eventId: 'e-miss',
        eventType: EVENTO_REPARO_CONCLUIDO,
        version: 1,
        occurredAt: new Date().toISOString(),
        source: 'execution',
        correlationId: 'corr-1',
        causationId: null,
        ordemServicoId: 'uuid-os1',
        rodada: 1,
        payload: {},
      }),
    ).rejects.toBeInstanceOf(OrdemServicoNaoEncontradaError);
  });

  it('reentrega com consumo reutilizado ainda finaliza sem impedimento', async () => {
    const { useCase, consumirReserva, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      divergencias: [],
      impedimentoInventario: false,
      reutilizado: true,
    });
    await useCase.executar(contexto, {
      eventId: 'e-reuse',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('reparo-interrompido delega consumo com tipo correto', async () => {
    const { useCase, consumirReserva } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      impedimentoInventario: false,
      reutilizado: false,
    });
    await useCase.executar(contexto, {
      eventId: 'int-1',
      eventType: EVENTO_REPARO_INTERROMPIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [] },
    });
    expect(consumirReserva.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        contextoFato: expect.objectContaining({
          tipoFato: 'REPARO_INTERROMPIDO',
        }),
      }),
      contexto,
    );
  });

  it('propaga ConsumoAplicadoIncompativelError do estoque', async () => {
    const { useCase, consumirReserva } = montarUseCase(StatusOS.EM_EXECUCAO);
    consumirReserva.execute = jest
      .fn()
      .mockRejectedValue(new ConsumoAplicadoIncompativelError());
    await expect(
      useCase.executar(contexto, {
        eventId: 'e-inc',
        eventType: EVENTO_REPARO_CONCLUIDO,
        version: 1,
        occurredAt: new Date().toISOString(),
        source: 'execution',
        correlationId: 'corr-1',
        causationId: null,
        ordemServicoId: 'uuid-os1',
        rodada: 1,
        payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
      }),
    ).rejects.toBeInstanceOf(ConsumoAplicadoIncompativelError);
  });

  it('OrçamentoGerado sem orcamentoId não chama projeção', async () => {
    const { useCase, transicoes, projecao } = montarUseCase(
      StatusOS.EM_DIAGNOSTICO,
    );
    await useCase.executar(contexto, {
      eventId: 'e-orc',
      eventType: EVENTO_ORCAMENTO_GERADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { valorTotalCentavos: 1000 },
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
    expect(projecao.registrarOrcamento).not.toHaveBeenCalled();
  });

  it('TarefaDevolvida aplica transição de devolução', async () => {
    const { useCase, transicoes } = montarUseCase(StatusOS.EM_DIAGNOSTICO);
    await useCase.executar(contexto, {
      eventId: 'e-dev',
      eventType: EVENTO_TAREFA_DEVOLVIDA_A_FILA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {},
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('OrcamentoRejeitado inicia nova rodada', async () => {
    const { useCase, transicoes } = montarUseCase(
      StatusOS.AGUARDANDO_APROVACAO,
    );
    await useCase.executar(contexto, {
      eventId: 'e-rej',
      eventType: EVENTO_ORCAMENTO_REJEITADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {},
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('reparo concluído antecipado em AGUARDANDO_EXECUCAO aplica transição', async () => {
    const { useCase, consumirReserva, transicoes } = montarUseCase(
      StatusOS.AGUARDANDO_EXECUCAO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      impedimentoInventario: false,
      reutilizado: false,
    });
    await useCase.executar(contexto, {
      eventId: 'e-adiant',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }] },
    });
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('pagamento em OS FINALIZADA abre pendência financeira', async () => {
    const { useCase, prisma } = montarUseCase(StatusOS.FINALIZADA);
    await useCase.executar(contexto, {
      eventId: 'e-tardio',
      eventType: EVENTO_PAGAMENTO_CONFIRMADO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { orderId: 'ORD-2', valorCentavos: 500 },
    });
    expect(prisma.pendenciaOs.create).toHaveBeenCalled();
  });

  it('reparo-falhou em EM_CANCELAMENTO não reinsere compensação iniciada', async () => {
    const { useCase, consumirReserva, transicoes } = montarUseCase(
      StatusOS.EM_CANCELAMENTO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      impedimentoInventario: false,
      reutilizado: false,
    });
    await useCase.executar(contexto, {
      eventId: 'falha-2',
      eventType: EVENTO_REPARO_FALHOU,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { pecasUtilizadas: [] },
    });
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('mapeia divergências opcionais do payload ao aplicar consumo', async () => {
    const { useCase, consumirReserva, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      impedimentoInventario: true,
      reutilizado: false,
    });
    await useCase.executar(contexto, {
      eventId: 'e-div',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {
        responsavelId: 'sub',
        pecasUtilizadas: [{ itemId: 'p1', quantidade: 2 }],
        divergencias: [
          {
            itemId: 'p1',
            quantidadePrevista: 1,
            quantidadeUtilizada: 2,
            tipo: 'CONSUMO_ACIMA',
            observacao: 'obs',
            justificativa: 'just',
          },
        ],
      },
    });
    expect(consumirReserva.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        contextoFato: expect.objectContaining({
          divergenciasFato: [
            expect.objectContaining({
              justificativa: 'just',
              observacao: 'obs',
            }),
          ],
        }),
      }),
      contexto,
    );
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('reparo-concluido preserva concluidoEm na transição', async () => {
    const { useCase, consumirReserva, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest.fn().mockResolvedValue({
      divergencias: [],
      impedimentoInventario: false,
      reutilizado: false,
    });
    const concluidoEm = '2025-08-10T10:00:00.000Z';
    await useCase.executar(contexto, {
      eventId: 'e-conc',
      eventType: EVENTO_REPARO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'execution',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: {
        concluidoEm,
        pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }],
      },
    });
    expect(transicoes.aplicar).toHaveBeenCalledWith(
      contexto,
      expect.objectContaining({
        ocorridoEm: new Date(concluidoEm),
      }),
    );
  });

  describe('fato terminal em EM_CANCELAMENTO com pendência de inventário (D4.3)', () => {
    const entregarFalha = (
      useCase: ReagirFatoSagaUseCase,
      eventId = 'falha-pendente',
    ) =>
      useCase.executar(contexto, {
        eventId,
        eventType: EVENTO_REPARO_FALHOU,
        version: 1,
        occurredAt: new Date().toISOString(),
        source: 'execution',
        correlationId: 'corr-1',
        causationId: null,
        ordemServicoId: 'uuid-os1',
        rodada: 1,
        payload: { pecasUtilizadas: [{ itemId: 'p1', quantidade: 3 }] },
      });

    it('registra o fato terminal mesmo com divergência de inventário pendente', async () => {
      const { useCase, consumirReserva, compensacao, reconciliacao } =
        montarUseCase(StatusOS.EM_CANCELAMENTO);
      consumirReserva.execute = jest.fn().mockResolvedValue({
        impedimentoInventario: true,
        reutilizado: false,
      });

      await entregarFalha(useCase);

      expect(compensacao.registrarFatoTerminalExecucao).toHaveBeenCalledWith(
        contexto,
        'uuid-os1',
        [{ itemId: 'p1', quantidade: 3 }],
      );
      expect(
        reconciliacao.resolverPendenciaInformacaoInsuficienteSeCausaEliminada,
      ).not.toHaveBeenCalled();
    });

    it('não registra o fato quando o consumo abre conflito ou informação insuficiente', async () => {
      const { useCase, compensacao, reconciliacao } = montarUseCase(
        StatusOS.EM_CANCELAMENTO,
      );
      reconciliacao.reconciliarFatoTerminal = jest
        .fn()
        .mockResolvedValue('pendencia_conflito');

      await entregarFalha(useCase);

      expect(compensacao.registrarFatoTerminalExecucao).not.toHaveBeenCalled();
    });
  });

  describe('PagamentoTardioRegistrado (D4.10)', () => {
    const entregarTardio = (useCase: ReagirFatoSagaUseCase) =>
      useCase.executar(contexto, {
        eventId: 'tardio-1',
        eventType: EVENTO_PAGAMENTO_TARDIO_REGISTRADO,
        version: 1,
        occurredAt: new Date().toISOString(),
        source: 'billing',
        correlationId: 'corr-1',
        causationId: null,
        ordemServicoId: 'uuid-os1',
        rodada: 1,
        payload: {
          cobrancaId: 'cob-1',
          aprovadoEm: '2026-06-15T15:00:00.000Z',
          tratamento: 'PENDENCIA_MANUAL',
        },
      });

    it.each([StatusOS.CANCELADA, StatusOS.ENTREGUE])(
      'em %s abre pendência financeira identificada pela cobrança, sem mudar o status',
      async (status) => {
        const { useCase, prisma, transicoes } = montarUseCase(status);

        await entregarTardio(useCase);

        expect(prisma.pendenciaOs.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              detalhes: { path: ['cobrancaId'], equals: 'cob-1' },
            }),
          }),
        );
        expect(prisma.pendenciaOs.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            tipo: 'FINANCEIRA',
            detalhes: expect.objectContaining({
              cobrancaId: 'cob-1',
              motivo: 'Pagamento tardio registrado após encerramento',
            }),
          }),
        });
        expect(transicoes.aplicar).not.toHaveBeenCalled();
      },
    );

    it.each(['ESTORNO_AUTOMATICO', 'PENDENCIA_MANUAL'])(
      'grava a natureza PAGAMENTO_TARDIO e o tratamento %s do payload',
      async (tratamento) => {
        const { useCase, prisma } = montarUseCase(StatusOS.CANCELADA);

        await useCase.executar(contexto, {
          eventId: 'tardio-2',
          eventType: EVENTO_PAGAMENTO_TARDIO_REGISTRADO,
          version: 1,
          occurredAt: new Date().toISOString(),
          source: 'billing',
          correlationId: 'corr-1',
          causationId: null,
          ordemServicoId: 'uuid-os1',
          rodada: 1,
          payload: { cobrancaId: 'cob-1', tratamento },
        });

        expect(prisma.pendenciaOs.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            detalhes: expect.objectContaining({
              natureza: 'PAGAMENTO_TARDIO',
              tratamento,
              cobrancaId: 'cob-1',
            }),
          }),
        });
      },
    );

    it('não duplica a pendência da mesma cobrança', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.CANCELADA);
      prisma.pendenciaOs.findFirst = jest.fn().mockResolvedValue({ id: 'p1' });

      await entregarTardio(useCase);

      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
    });

    it('ignora o fato com a OS fora de CANCELADA e ENTREGUE', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.AGUARDANDO_PAGAMENTO);

      await entregarTardio(useCase);

      expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
    });
  });

  describe('natureza da pendência financeira', () => {
    const pagamentoDeOutraOrder = (useCase: ReagirFatoSagaUseCase) =>
      useCase.executar(contexto, {
        eventId: 'e-segundo',
        eventType: EVENTO_PAGAMENTO_CONFIRMADO,
        version: 1,
        occurredAt: new Date().toISOString(),
        source: 'billing',
        correlationId: 'corr-1',
        causationId: null,
        ordemServicoId: 'uuid-os1',
        rodada: 1,
        payload: { cobrancaId: 'cob-1', orderId: 'ORD-2', valorCentavos: 500 },
      });

    it.each([
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
    ])(
      'segundo pagamento em %s grava natureza SEGUNDO_PAGAMENTO',
      async (status) => {
        const { useCase, prisma, projecao } = montarUseCase(status);
        projecao.buscarOrdersPagas.mockResolvedValue(['ORD-1']);

        await pagamentoDeOutraOrder(useCase);

        expect(prisma.pendenciaOs.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            detalhes: expect.objectContaining({
              natureza: 'SEGUNDO_PAGAMENTO',
              orderId: 'ORD-2',
              cobrancaId: 'cob-1',
            }),
          }),
        });
      },
    );

    it.each([StatusOS.CANCELADA, StatusOS.ENTREGUE])(
      'pagamento em %s não grava natureza',
      async (status) => {
        const { useCase, prisma } = montarUseCase(status);

        await pagamentoDeOutraOrder(useCase);

        const { detalhes } = prisma.pendenciaOs.create.mock.calls[0][0].data;
        expect(detalhes).not.toHaveProperty('natureza');
      },
    );
  });

  it('EstornoConcluido não resolve a pendência SEGUNDO_PAGAMENTO, mesmo com a mesma cobrança', async () => {
    const { useCase, prisma } = montarUseCase(StatusOS.FINALIZADA);
    prisma.pendenciaOs.findMany = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        detalhes: { natureza: 'SEGUNDO_PAGAMENTO', cobrancaId: 'cob-a' },
      },
      { id: 'p2', detalhes: { cobrancaId: 'cob-a' } },
    ]);
    await useCase.executar(contexto, {
      eventId: 'e-estorno',
      eventType: EVENTO_ESTORNO_CONCLUIDO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: 'corr-1',
      causationId: null,
      ordemServicoId: 'uuid-os1',
      rodada: 1,
      payload: { cobrancaId: 'cob-a' },
    });
    expect(prisma.pendenciaOs.update).toHaveBeenCalledTimes(1);
    expect(prisma.pendenciaOs.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p2' } }),
    );
  });

  describe('evidência do estorno do segundo pagamento', () => {
    const payloadEstorno = {
      cobrancaId: 'cob-a',
      orderId: 'ORD-2',
      valorEstornadoCentavos: 500,
      tipoEstorno: 'INTEGRAL',
      estornadoEm: '2026-11-19T10:00:00.000Z',
      statusOrderMercadoPago: 'refunded',
    };
    const detalhesSegundoPagamento = {
      natureza: 'SEGUNDO_PAGAMENTO',
      orderId: 'ORD-2',
      cobrancaId: 'cob-a',
      motivo: 'Segundo pagamento antes do encerramento',
    };

    const entregarEstorno = (
      useCase: ReagirFatoSagaUseCase,
      payload: Record<string, unknown> = payloadEstorno,
      eventId = 'e-estorno-1',
    ) =>
      useCase.executar(contexto, {
        eventId,
        eventType: EVENTO_ESTORNO_CONCLUIDO,
        version: 1,
        occurredAt: new Date().toISOString(),
        source: 'billing',
        correlationId: 'corr-1',
        causationId: null,
        ordemServicoId: 'uuid-os1',
        rodada: 1,
        payload,
      });

    it.each([
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
    ])(
      'registra a evidência em %s sem resolver nem mudar o status',
      async (status) => {
        const { useCase, prisma, transicoes, compensacao } =
          montarUseCase(status);
        prisma.pendenciaOs.findFirst = jest.fn().mockResolvedValue({
          id: 'p1',
          detalhes: detalhesSegundoPagamento,
        });
        prisma.pendenciaOs.findMany = jest
          .fn()
          .mockResolvedValue([
            { id: 'p1', detalhes: detalhesSegundoPagamento },
          ]);

        await entregarEstorno(useCase);

        expect(prisma.pendenciaOs.update).toHaveBeenCalledTimes(1);
        expect(prisma.pendenciaOs.update).toHaveBeenCalledWith({
          where: { id: 'p1' },
          data: {
            detalhes: {
              ...detalhesSegundoPagamento,
              evidenciaEstornoBilling: {
                eventId: 'e-estorno-1',
                ...payloadEstorno,
              },
            },
          },
        });
        expect(transicoes.aplicar).not.toHaveBeenCalled();
        expect(compensacao.avancarSeEmCancelamento).not.toHaveBeenCalled();
      },
    );

    it('em execução só registra a evidência e não resolve outras pendências da cobrança', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.EM_EXECUCAO);
      prisma.pendenciaOs.findFirst = jest.fn().mockResolvedValue(null);
      prisma.pendenciaOs.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'p2', detalhes: { cobrancaId: 'cob-a' } }]);

      await entregarEstorno(useCase);

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('ignora o estorno sem pendência SEGUNDO_PAGAMENTO aberta do orderId', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.EM_EXECUCAO);
      prisma.pendenciaOs.findFirst = jest.fn().mockResolvedValue(null);

      await entregarEstorno(useCase);

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('ignora o estorno sem orderId', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.EM_EXECUCAO);

      await entregarEstorno(useCase, { cobrancaId: 'cob-a' });

      expect(prisma.pendenciaOs.findFirst).not.toHaveBeenCalled();
      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('é idempotente na reentrega do mesmo evento', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.EM_EXECUCAO);
      prisma.pendenciaOs.findFirst = jest.fn().mockResolvedValue({
        id: 'p1',
        detalhes: {
          ...detalhesSegundoPagamento,
          evidenciaEstornoBilling: {
            eventId: 'e-estorno-1',
            tipoEstorno: 'PARCIAL',
          },
        },
      });

      await entregarEstorno(useCase);

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('não substitui a evidência integral por um estorno posterior', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.FINALIZADA);
      prisma.pendenciaOs.findFirst = jest.fn().mockResolvedValue({
        id: 'p1',
        detalhes: {
          ...detalhesSegundoPagamento,
          evidenciaEstornoBilling: {
            eventId: 'e-anterior',
            tipoEstorno: 'INTEGRAL',
          },
        },
      });

      await entregarEstorno(
        useCase,
        { ...payloadEstorno, tipoEstorno: 'PARCIAL' },
        'e-estorno-2',
      );

      expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
    });

    it('substitui a evidência parcial por um estorno integral', async () => {
      const { useCase, prisma } = montarUseCase(StatusOS.FINALIZADA);
      prisma.pendenciaOs.findFirst = jest.fn().mockResolvedValue({
        id: 'p1',
        detalhes: {
          ...detalhesSegundoPagamento,
          evidenciaEstornoBilling: {
            eventId: 'e-anterior',
            tipoEstorno: 'PARCIAL',
          },
        },
      });

      await entregarEstorno(useCase, payloadEstorno, 'e-estorno-2');

      expect(prisma.pendenciaOs.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            detalhes: expect.objectContaining({
              evidenciaEstornoBilling: expect.objectContaining({
                eventId: 'e-estorno-2',
                tipoEstorno: 'INTEGRAL',
              }),
            }),
          },
        }),
      );
    });
  });
});
