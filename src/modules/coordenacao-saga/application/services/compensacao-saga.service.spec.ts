import { criarOrdemFake } from '@/modules/ordens-servico/application/use-cases/test-doubles';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { ReservaJaProcessadaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  PassoCompensacaoSaga,
  ResultadoExecucaoCompensacao,
  TipoPedidoSaga,
} from '@/shared/generated/prisma/enums';
import {
  FinalidadeConsultaFinanceira,
  SituacaoEstornoFinanceira,
  SituacaoPagamentoFinanceira,
  consultaIdExcecaoE10,
} from '../../domain/consulta-financeira';
import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from '../../domain/resultado-cancelamento-execucao';
import type { EstadoCompensacaoSnapshot } from '../ports/estado-compensacao.gateway';
import { CompensacaoSagaService } from './compensacao-saga.service';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

const contexto = { __contextoTransacao: Symbol() } as ContextoTransacao;

function snapshotInicial(
  parcial?: Partial<EstadoCompensacaoSnapshot>,
): EstadoCompensacaoSnapshot {
  return {
    ordemServicoId: 'os-1',
    rodada: 1,
    passo: PassoCompensacaoSaga.EXECUCAO,
    resultadoExecucao: null,
    consultaIdVigente: null,
    aguardandoResposta: false,
    reparoIniciadoDuranteCancelamento: false,
    fatoTerminalExecucao: false,
    pecasUtilizadas: null,
    condicoesE10: null,
    ...parcial,
  };
}

describe('CompensacaoSagaService', () => {
  const logger = { logWithMeta: jest.fn() };

  const montar = (opts?: {
    status?: StatusOS;
    ordemParcial?: Parameters<typeof criarOrdemFake>[0];
    snapshot?: EstadoCompensacaoSnapshot;
    pendenciaAberta?: boolean;
    pedidoReparoEmitido?: boolean;
    bloquearEmissaoFinanceira?: boolean;
  }) => {
    const ordem = criarOrdemFake({
      id: 'os-1',
      status: opts?.status ?? StatusOS.EM_CANCELAMENTO,
      rodadaVigente: 1,
      correlationId: 'corr-1',
      ...opts?.ordemParcial,
    });
    const estadoSnap =
      opts?.snapshot ??
      snapshotInicial({
        ordemServicoId: ordem.id!,
        rodada: ordem.rodadaVigente,
      });
    let estadoSnapMutavel = { ...estadoSnap };

    const ordens = {
      bloquearParaAtualizacao: jest.fn().mockResolvedValue({
        ordem,
        cliente: { id: 'c1', nome: 'A', email: 'a@b.com' },
        veiculo: { placa: 'ABC', modelo: 'X' },
      }),
    };
    const transicoes = {
      aplicar: jest.fn().mockResolvedValue({ mudouStatus: true }),
    };
    const estado = {
      obterOuCriar: jest
        .fn()
        .mockImplementation(() => Promise.resolve(estadoSnapMutavel)),
      salvar: jest
        .fn()
        .mockImplementation(
          (_ctx: unknown, snap: EstadoCompensacaoSnapshot) => {
            estadoSnapMutavel = snap;
            return Promise.resolve();
          },
        ),
    };
    const pedidos = {
      existeEmitido: jest
        .fn()
        .mockImplementation(
          (
            _ctx: unknown,
            _os: unknown,
            _rod: unknown,
            tipo: TipoPedidoSaga,
          ) => {
            if (
              opts?.bloquearEmissaoFinanceira &&
              (tipo === TipoPedidoSaga.CANCELAR_FINANCEIRO ||
                tipo === TipoPedidoSaga.CANCELAR_TAREFA)
            ) {
              return Promise.resolve(true);
            }
            return Promise.resolve(false);
          },
        ),
      marcarConcluidoPorTipo: jest.fn(),
    };
    const comandos = {
      emitirCancelarTarefa: jest.fn(),
      emitirCancelarFinanceiro: jest.fn(),
      emitirConsultarSituacaoFinanceira: jest.fn(),
    };
    const consumir = {
      execute: jest.fn().mockResolvedValue({ divergencias: [] }),
    };
    const liberar = { execute: jest.fn() };
    const reservas = {
      possuiConsumoAplicado: jest.fn().mockResolvedValue(false),
      possuiConsumoAplicadoNaRodada: jest.fn().mockResolvedValue(false),
    };
    const prisma = {
      pendenciaOs: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts?.pendenciaAberta ? { id: 'p1' } : null),
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts?.pendenciaAberta
              ? [{ id: 'p1', detalhes: { motivo: 'teste' } }]
              : [],
          ),
        create: jest.fn(),
        update: jest.fn(),
      },
      pedidoEmitido: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts?.pedidoReparoEmitido ? { id: 'ped' } : null),
      },
    };

    const service = new CompensacaoSagaService(
      ordens as never,
      transicoes as never,
      estado,
      pedidos as never,
      comandos as never,
      consumir as never,
      liberar as never,
      reservas as never,
      logger as never,
      prisma as never,
    );

    return {
      service,
      ordem,
      ordens,
      estado,
      pedidos,
      comandos,
      consumir,
      liberar,
      reservas,
      transicoes,
      prisma,
      logger,
      getSnapshot: () => estadoSnapMutavel,
    };
  };

  it('ignora fatos quando a OS não está em EM_CANCELAMENTO', async () => {
    const { service, estado, ordens } = montar({ status: StatusOS.CANCELADA });
    ordens.bloquearParaAtualizacao.mockResolvedValue(null);
    await service.tratarRespostaCancelamento(contexto, 'os-1', 'caus', {
      tipoTarefa: TipoTarefaCancelamento.DIAGNOSTICO,
      resultado: ResultadoCancelamentoExecucao.CANCELADA_SEM_INICIO,
    });
    expect(estado.obterOuCriar).not.toHaveBeenCalled();
  });

  it('marca aguardando resposta em INTERRUPCAO_SOLICITADA', async () => {
    const { service, getSnapshot } = montar();
    await service.tratarRespostaCancelamento(contexto, 'os-1', 'caus', {
      tipoTarefa: TipoTarefaCancelamento.REPARO,
      resultado: ResultadoCancelamentoExecucao.INTERRUPCAO_SOLICITADA,
    });
    expect(getSnapshot().aguardandoResposta).toBe(true);
  });

  it('REPARO JA_CONCLUIDA dispara consulta E10 e não assume diagnóstico como reparo', async () => {
    const { service, comandos, getSnapshot } = montar();
    await service.tratarRespostaCancelamento(contexto, 'os-1', 'caus', {
      tipoTarefa: TipoTarefaCancelamento.REPARO,
      resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
    });
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.CONSULTA_E10);
    expect(comandos.emitirConsultarSituacaoFinanceira).toHaveBeenCalledWith(
      contexto,
      expect.anything(),
      'caus',
      consultaIdExcecaoE10('os-1', 1),
      FinalidadeConsultaFinanceira.EXCECAO_E10,
    );
  });

  it('resposta de diagnóstico segue para financeiro sem E10', async () => {
    const { service, pedidos, getSnapshot } = montar({
      bloquearEmissaoFinanceira: true,
      ordemParcial: { diagnosticoConcluidoEm: new Date() },
    });
    await service.tratarRespostaCancelamento(contexto, 'os-1', 'caus', {
      tipoTarefa: TipoTarefaCancelamento.DIAGNOSTICO,
      resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
    });
    expect(pedidos.marcarConcluidoPorTipo).toHaveBeenCalledWith(
      contexto,
      'os-1',
      1,
      TipoPedidoSaga.CANCELAR_TAREFA,
    );
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.FINANCEIRO);
  });

  it('ignora SituacaoFinanceira com consultaId divergente', async () => {
    const { service, logger, transicoes } = montar({
      snapshot: snapshotInicial({
        consultaIdVigente: 'vigente',
        passo: PassoCompensacaoSaga.CONSULTA_E10,
      }),
    });
    await service.tratarSituacaoFinanceiraE10(contexto, 'os-1', 'caus', {
      consultaId: 'outro',
      situacaoPagamento: SituacaoPagamentoFinanceira.PAGO_NO_PRAZO,
      situacaoEstorno: SituacaoEstornoFinanceira.NENHUM,
    });
    expect(logger.logWithMeta).toHaveBeenCalled();
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('INDETERMINADA em E10 mantém aguardando sem finalizar', async () => {
    const { service, getSnapshot, transicoes } = montar({
      snapshot: snapshotInicial({
        consultaIdVigente: 'c1',
        passo: PassoCompensacaoSaga.CONSULTA_E10,
      }),
    });
    await service.tratarSituacaoFinanceiraE10(contexto, 'os-1', 'caus', {
      consultaId: 'c1',
      situacaoPagamento: SituacaoPagamentoFinanceira.INDETERMINADA,
      situacaoEstorno: SituacaoEstornoFinanceira.NENHUM,
    });
    expect(getSnapshot().aguardandoResposta).toBe(true);
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('E10 sem pagamento válido retorna ao passo financeiro', async () => {
    const { service, getSnapshot } = montar({
      bloquearEmissaoFinanceira: true,
      pedidoReparoEmitido: true,
      snapshot: snapshotInicial({
        consultaIdVigente: 'c1',
        passo: PassoCompensacaoSaga.CONSULTA_E10,
      }),
    });
    await service.tratarSituacaoFinanceiraE10(contexto, 'os-1', 'caus', {
      consultaId: 'c1',
      situacaoPagamento: SituacaoPagamentoFinanceira.SEM_PAGAMENTO,
      situacaoEstorno: SituacaoEstornoFinanceira.NENHUM,
    });
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.FINANCEIRO);
    expect(getSnapshot().resultadoExecucao).toBe(
      ResultadoExecucaoCompensacao.REPARO_INICIADO,
    );
  });

  it('E10 com condições financeiras ok avança para estoque', async () => {
    const { service, getSnapshot, liberar } = montar({
      pedidoReparoEmitido: true,
      snapshot: snapshotInicial({
        consultaIdVigente: 'c1',
        passo: PassoCompensacaoSaga.CONSULTA_E10,
        aguardandoResposta: true,
        condicoesE10: {
          reparoConcluidoAntesCancelamento: true,
          pagamentoValido: false,
          semEstorno: false,
          estoqueConciliado: false,
        },
      }),
    });
    await service.tratarSituacaoFinanceiraE10(contexto, 'os-1', 'caus', {
      consultaId: 'c1',
      situacaoPagamento: SituacaoPagamentoFinanceira.PAGO_NO_PRAZO,
      situacaoEstorno: SituacaoEstornoFinanceira.NENHUM,
    });
    expect(getSnapshot().condicoesE10?.pagamentoValido).toBe(true);
    expect(liberar.execute).toHaveBeenCalled();
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.CONCLUIDO);
  });

  it('pendência manual financeira libera aguardandoResposta e prepara estoque', async () => {
    const { service, prisma, liberar, getSnapshot } = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.FINANCEIRO,
        aguardandoResposta: true,
      }),
    });
    await service.tratarRespostaCancelamentoFinanceiro(
      contexto,
      'os-1',
      'caus',
      {
        resultado: 'PENDENCIA_MANUAL_ABERTA',
        pendenciaId: 'pend-1',
      },
    );
    expect(prisma.pendenciaOs.create).toHaveBeenCalled();
    expect(getSnapshot().aguardandoResposta).toBe(false);
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.ESTOQUE);
    expect(liberar.execute).not.toHaveBeenCalled();
  });

  it('pula CancelarTarefa com diagnóstico concluído sem IniciarReparo', async () => {
    const { service, comandos, getSnapshot } = montar({
      bloquearEmissaoFinanceira: true,
      ordemParcial: {
        diagnosticoConcluidoEm: new Date(),
      },
    });
    await service.avancarAposEntradaEmCancelamento(contexto, {
      ordemServicoId: 'os-1',
      rodada: 1,
      causationId: 'caus',
    });
    expect(comandos.emitirCancelarTarefa).not.toHaveBeenCalled();
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.FINANCEIRO);
  });

  it('emite CancelarTarefa quando há tarefa de reparo aberta', async () => {
    const { service, comandos } = montar({ pedidoReparoEmitido: true });
    await service.avancarAposEntradaEmCancelamento(contexto, {
      ordemServicoId: 'os-1',
      rodada: 1,
      causationId: 'caus',
    });
    expect(comandos.emitirCancelarTarefa).toHaveBeenCalled();
  });

  it('supersede consulta de prazo ao entrar em compensação', async () => {
    const { service, prisma, getSnapshot } = montar();
    prisma.pendenciaOs.findMany.mockResolvedValue([
      {
        id: 'pc',
        detalhes: { natureza: 'CONSULTA_PRAZO_REFERENCIA' },
      },
    ]);
    await service.avancarAposEntradaEmCancelamento(contexto, {
      ordemServicoId: 'os-1',
      rodada: 1,
      causationId: 'caus',
    });
    expect(prisma.pendenciaOs.update).toHaveBeenCalled();
    expect(getSnapshot().consultaIdVigente).toBeNull();
  });

  it('ignora SituacaoFinanceira fora do passo CONSULTA_E10', async () => {
    const { service, getSnapshot, logger } = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.FINANCEIRO,
        consultaIdVigente: 'c-prazo',
      }),
    });
    await service.tratarSituacaoFinanceiraE10(contexto, 'os-1', 'caus', {
      consultaId: 'c-prazo',
      situacaoPagamento: SituacaoPagamentoFinanceira.PAGO_NO_PRAZO,
      situacaoEstorno: SituacaoEstornoFinanceira.NENHUM,
    });
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.FINANCEIRO);
    expect(logger.logWithMeta).toHaveBeenCalled();
  });

  it('não encerra em CANCELADA com pendência aberta', async () => {
    const { service, transicoes } = montar({
      pendenciaAberta: true,
      snapshot: snapshotInicial({ passo: PassoCompensacaoSaga.ENCERRAMENTO }),
    });
    await service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(transicoes.aplicar).not.toHaveBeenCalled();
  });

  it('encerra em CANCELADA sem pendências após estoque', async () => {
    const { service, transicoes } = montar({
      snapshot: snapshotInicial({ passo: PassoCompensacaoSaga.ENCERRAMENTO }),
    });
    await service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('E10 completa com exceção FINALIZADA após estoque conciliado', async () => {
    const { service, transicoes } = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.ESTOQUE,
        condicoesE10: {
          reparoConcluidoAntesCancelamento: true,
          pagamentoValido: true,
          semEstorno: true,
          estoqueConciliado: false,
        },
      }),
    });
    await service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(transicoes.aplicar).toHaveBeenCalledWith(
      contexto,
      expect.objectContaining({
        observacao: expect.stringContaining('E10'),
      }),
    );
  });

  it('consumo com divergência interrompe passo de estoque', async () => {
    const ctx = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.ESTOQUE,
        pecasUtilizadas: [{ itemId: 'peca-1', quantidade: 1 }],
      }),
    });
    ctx.consumir.execute.mockResolvedValue({
      divergencias: [{ pecaId: 'peca-1' }],
      impedimentoInventario: true,
    });
    await ctx.service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(ctx.liberar.execute).not.toHaveBeenCalled();
  });

  it('pula novo consumo quando há registro persistente na rodada', async () => {
    const ctx = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.ESTOQUE,
        pecasUtilizadas: [{ itemId: 'peca-1', quantidade: 1 }],
      }),
    });
    ctx.reservas.possuiConsumoAplicadoNaRodada.mockResolvedValue(true);
    await ctx.service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(ctx.consumir.execute).not.toHaveBeenCalled();
    expect(ctx.liberar.execute).toHaveBeenCalled();
  });

  it('ReservaJaProcessada com consumo na rodada libera sem novo consumir', async () => {
    const ctx = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.ESTOQUE,
        pecasUtilizadas: [{ itemId: 'peca-1', quantidade: 1 }],
      }),
    });
    ctx.consumir.execute.mockRejectedValue(
      new ReservaJaProcessadaError('os-1'),
    );
    ctx.reservas.possuiConsumoAplicadoNaRodada.mockResolvedValue(true);
    await ctx.service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(ctx.liberar.execute).toHaveBeenCalled();
  });

  it('repropaga ReservaJaProcessada quando consumo não está aplicado', async () => {
    const ctx = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.ESTOQUE,
        pecasUtilizadas: [{ itemId: 'peca-1', quantidade: 1 }],
      }),
    });
    ctx.consumir.execute.mockRejectedValue(
      new ReservaJaProcessadaError('os-1'),
    );
    ctx.reservas.possuiConsumoAplicado.mockResolvedValue(false);
    await expect(
      ctx.service.avancarSeEmCancelamento(contexto, 'os-1', 'caus'),
    ).rejects.toBeInstanceOf(ReservaJaProcessadaError);
  });

  it('registrarReparoIniciadoDuranteCancelamento persiste flag', async () => {
    const { service, getSnapshot } = montar();
    await service.registrarReparoIniciadoDuranteCancelamento(contexto, 'os-1');
    expect(getSnapshot().reparoIniciadoDuranteCancelamento).toBe(true);
  });

  it('não avança compensação enquanto aguarda resposta', async () => {
    const ctx = montar({
      snapshot: snapshotInicial({ aguardandoResposta: true }),
    });
    await ctx.service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(ctx.comandos.emitirCancelarTarefa).not.toHaveBeenCalled();
  });

  it('resposta de reparo em andamento segue para financeiro com REPARO_INICIADO', async () => {
    const { service, getSnapshot } = montar({ pedidoReparoEmitido: true });
    await service.tratarRespostaCancelamento(contexto, 'os-1', 'caus', {
      tipoTarefa: TipoTarefaCancelamento.REPARO,
      resultado: ResultadoCancelamentoExecucao.CANCELADA_EM_ANDAMENTO,
      pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }],
    });
    expect(getSnapshot().resultadoExecucao).toBe(
      ResultadoExecucaoCompensacao.REPARO_INICIADO,
    );
  });

  it('aceita consumo idempotente quando reserva já processada e consumo aplicado', async () => {
    const ctx = montar({
      snapshot: snapshotInicial({
        passo: PassoCompensacaoSaga.ESTOQUE,
        pecasUtilizadas: [{ itemId: 'peca-1', quantidade: 1 }],
      }),
    });
    ctx.consumir.execute.mockRejectedValue(
      new ReservaJaProcessadaError('os-1'),
    );
    ctx.reservas.possuiConsumoAplicado.mockResolvedValue(true);
    await ctx.service.avancarSeEmCancelamento(contexto, 'os-1', 'caus');
    expect(ctx.liberar.execute).toHaveBeenCalled();
  });

  it('E10 rejeitada com estorno em andamento volta ao financeiro', async () => {
    const { service, getSnapshot } = montar({
      pedidoReparoEmitido: true,
      bloquearEmissaoFinanceira: true,
      snapshot: snapshotInicial({
        consultaIdVigente: 'c1',
        passo: PassoCompensacaoSaga.CONSULTA_E10,
        aguardandoResposta: true,
      }),
    });
    await service.tratarSituacaoFinanceiraE10(contexto, 'os-1', 'caus', {
      consultaId: 'c1',
      situacaoPagamento: SituacaoPagamentoFinanceira.PAGO_NO_PRAZO,
      situacaoEstorno: SituacaoEstornoFinanceira.EM_ANDAMENTO,
    });
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.FINANCEIRO);
    expect(getSnapshot().condicoesE10?.semEstorno).toBe(false);
  });

  it('fato terminal de execução define REPARO_INICIADO e avança financeiro', async () => {
    const { service, getSnapshot, pedidos, comandos } = montar({
      bloquearEmissaoFinanceira: true,
      pedidoReparoEmitido: true,
    });
    await service.registrarFatoTerminalExecucao(contexto, 'os-1', [
      { itemId: 'p1', quantidade: 2 },
    ]);
    expect(getSnapshot().resultadoExecucao).toBe(
      ResultadoExecucaoCompensacao.REPARO_INICIADO,
    );
    expect(getSnapshot().passo).toBe(PassoCompensacaoSaga.FINANCEIRO);
    expect(pedidos.marcarConcluidoPorTipo).toHaveBeenCalled();
    expect(comandos.emitirCancelarTarefa).not.toHaveBeenCalled();
  });
});
