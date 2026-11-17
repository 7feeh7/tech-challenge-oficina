import { criarOrdemFake } from '@/modules/ordens-servico/application/use-cases/test-doubles';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { ReservaJaProcessadaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import {
  EVENTO_COBRANCA_EXPIRADA,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_INICIADO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { ReagirFatoSagaUseCase } from './reagir-fato-saga.use-case';

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
    const reservas = { possuiConsumoAplicado: jest.fn() };
    const pedidos = { registrar: jest.fn() };
    const projecao = {
      buscarOrderIdPrincipal: jest.fn().mockResolvedValue(null),
      registrarPagamento: jest.fn().mockResolvedValue('criado'),
    };
    const prisma = { pendenciaOs: { create: jest.fn() } };
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
      estadoCompensacao as never,
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

  it('finaliza quando consumo já estava CONSUMIDA', async () => {
    const { useCase, consumirReserva, reservas, transicoes } = montarUseCase(
      StatusOS.EM_EXECUCAO,
    );
    consumirReserva.execute = jest
      .fn()
      .mockRejectedValue(new ReservaJaProcessadaError());
    reservas.possuiConsumoAplicado = jest.fn().mockResolvedValue(true);
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
});
