import { randomUUID } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type { CompensacaoAvancoPort } from '@/shared/saga/compensacao-avanco.port';
import { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { ConsumirReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import { LiberarReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/liberar-reserva-estoque.use-case';
import type { ReservaEstoqueGateway } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ReservaEstoqueNaoEncontradaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  PassoCompensacaoSaga,
  ResultadoExecucaoCompensacao,
  TipoPedidoSaga,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  consultaIdExcecaoE10,
  FinalidadeConsultaFinanceira,
  SituacaoEstornoFinanceira,
  SituacaoPagamentoFinanceira,
  type CondicoesExcecaoE10,
} from '../../domain/consulta-financeira';
import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from '../../domain/resultado-cancelamento-execucao';
import type { ComandosSagaOutboxService } from './comandos-saga-outbox.service';
import type { EstadoCompensacaoGateway } from '../ports/estado-compensacao.gateway';
import type { PedidoEmitidoGateway } from '../ports/pedido-emitido.gateway';
import type { RespostaCancelamentoContrato } from '../../domain/resposta-cancelamento-contrato';
import { SituacaoTarefaCancelamento } from '../../domain/situacao-tarefa-cancelamento';
import type { ReconciliacaoConsumoSagaService } from './reconciliacao-consumo-saga.service';

export type RespostaCancelamentoPayload = RespostaCancelamentoContrato;

export interface SituacaoFinanceiraPayload {
  consultaId: string;
  situacaoPagamento: SituacaoPagamentoFinanceira;
  situacaoEstorno: SituacaoEstornoFinanceira;
  cobrancaId?: string;
  orderId?: string;
  valorCentavos?: number;
}

export interface RespostaCancelamentoFinanceiroPayload {
  resultado:
    | 'NADA_A_CANCELAR'
    | 'CANCELADA'
    | 'ESTORNADA'
    | 'PENDENCIA_MANUAL_ABERTA';
  pendenciaId?: string;
}

export class CompensacaoSagaService implements CompensacaoAvancoPort {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly transicoes: TransicaoOrdemServicoService,
    private readonly estado: EstadoCompensacaoGateway,
    private readonly pedidos: PedidoEmitidoGateway,
    private readonly comandos: ComandosSagaOutboxService,
    private readonly consumir: ConsumirReservaEstoqueUseCase,
    private readonly liberar: LiberarReservaEstoqueUseCase,
    private readonly reservas: ReservaEstoqueGateway,
    private readonly logger: JsonLoggerService,
    private readonly prisma: PrismaService,
    private readonly reconciliacao: ReconciliacaoConsumoSagaService,
  ) {}

  async avancarAposEntradaEmCancelamento(
    contexto: ContextoTransacao,
    input: { ordemServicoId: string; rodada: number; causationId: string },
  ): Promise<void> {
    await this.supersederConsultaPrazoReferencia(
      contexto,
      input.ordemServicoId,
      input.rodada,
    );
    await this.avancar(contexto, input.ordemServicoId, input.causationId);
  }

  async avancarSeEmCancelamento(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
  ): Promise<void> {
    await this.avancar(contexto, ordemServicoId, causationId);
  }

  async registrarReparoIniciadoDuranteCancelamento(
    contexto: ContextoTransacao,
    ordemServicoId: string,
  ): Promise<void> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada || bloqueada.ordem.status !== StatusOS.EM_CANCELAMENTO) {
      return;
    }
    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
    );
    snapshot.reparoIniciadoDuranteCancelamento = true;
    await this.estado.salvar(contexto, snapshot);
  }

  async registrarFatoTerminalExecucao(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    pecasUtilizadas: { itemId: string; quantidade: number }[],
  ): Promise<void> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada || bloqueada.ordem.status !== StatusOS.EM_CANCELAMENTO) {
      return;
    }
    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
    );
    snapshot.fatoTerminalExecucao = true;
    snapshot.pecasUtilizadas = pecasUtilizadas;
    snapshot.resultadoExecucao = ResultadoExecucaoCompensacao.REPARO_INICIADO;
    snapshot.aguardandoResposta = false;
    snapshot.passo = PassoCompensacaoSaga.FINANCEIRO;
    await this.estado.salvar(contexto, snapshot);
    await this.pedidos.marcarConcluidoPorTipo(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.CANCELAR_TAREFA,
    );
    await this.avancar(contexto, ordemServicoId, randomCausation());
  }

  async tratarRespostaCancelamento(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
    payload: RespostaCancelamentoPayload,
  ): Promise<void> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada || bloqueada.ordem.status !== StatusOS.EM_CANCELAMENTO) {
      return;
    }
    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
    );
    if (
      payload.resultado === ResultadoCancelamentoExecucao.INTERRUPCAO_SOLICITADA
    ) {
      snapshot.aguardandoResposta = true;
      await this.estado.salvar(contexto, snapshot);
      return;
    }
    await this.pedidos.marcarConcluidoPorTipo(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.CANCELAR_TAREFA,
    );
    snapshot.aguardandoResposta = false;
    if (payload.pecasUtilizadas?.length) {
      snapshot.pecasUtilizadas = payload.pecasUtilizadas;
    }
    const reconciliacao =
      await this.reconciliacao.reconciliarRespostaCancelamento(
        contexto,
        ordemServicoId,
        bloqueada.ordem.rodadaVigente,
        causationId,
        payload,
      );
    if (
      reconciliacao === 'impedimento_inventario' ||
      reconciliacao === 'pendencia_informacao' ||
      reconciliacao === 'pendencia_conflito'
    ) {
      await this.estado.salvar(contexto, snapshot);
      return;
    }
    if (reconciliacao === 'aplicado' || reconciliacao === 'reutilizado') {
      await this.reconciliacao.resolverPendenciaInformacaoInsuficienteSeCausaEliminada(
        contexto,
        ordemServicoId,
        bloqueada.ordem.rodadaVigente,
      );
    }
    if (
      payload.tipoTarefa === TipoTarefaCancelamento.REPARO &&
      payload.resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA &&
      payload.situacaoTarefa === SituacaoTarefaCancelamento.CONCLUIDA
    ) {
      snapshot.passo = PassoCompensacaoSaga.CONSULTA_E10;
      snapshot.resultadoExecucao = ResultadoExecucaoCompensacao.REPARO_INICIADO;
      const condicoes: CondicoesExcecaoE10 = {
        reparoConcluidoAntesCancelamento: true,
        pagamentoValido: false,
        semEstorno: false,
        estoqueConciliado: false,
      };
      snapshot.condicoesE10 = condicoes;
      await this.estado.salvar(contexto, snapshot);
      await this.emitirConsultaE10(contexto, bloqueada, causationId, snapshot);
      return;
    }
    if (payload.tipoTarefa === TipoTarefaCancelamento.DIAGNOSTICO) {
      snapshot.resultadoExecucao = this.resultadoExecucaoDe(snapshot);
      snapshot.passo = PassoCompensacaoSaga.FINANCEIRO;
      await this.estado.salvar(contexto, snapshot);
      await this.avancar(contexto, ordemServicoId, causationId);
      return;
    }
    snapshot.resultadoExecucao = ResultadoExecucaoCompensacao.REPARO_INICIADO;
    snapshot.passo = PassoCompensacaoSaga.FINANCEIRO;
    await this.estado.salvar(contexto, snapshot);
    await this.avancar(contexto, ordemServicoId, causationId);
  }

  async tratarSituacaoFinanceiraE10(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
    payload: SituacaoFinanceiraPayload,
  ): Promise<void> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada || bloqueada.ordem.status !== StatusOS.EM_CANCELAMENTO) {
      return;
    }
    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
    );
    if (snapshot.passo !== PassoCompensacaoSaga.CONSULTA_E10) {
      this.logger.logWithMeta(
        'info',
        'saga.consulta.financeira.ignorada',
        {
          consultaId: payload.consultaId,
          passo: snapshot.passo,
          motivo: 'consulta fora da exceção E10',
        },
        'CoordenacaoSaga',
      );
      return;
    }
    if (
      !snapshot.consultaIdVigente ||
      snapshot.consultaIdVigente !== payload.consultaId
    ) {
      this.logger.logWithMeta(
        'info',
        'saga.consulta.financeira.ignorada',
        { consultaId: payload.consultaId, vigente: snapshot.consultaIdVigente },
        'CoordenacaoSaga',
      );
      return;
    }
    await this.pedidos.marcarConcluidoPorTipo(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.CONSULTAR_SITUACAO_FINANCEIRA,
    );
    snapshot.aguardandoResposta = false;
    const condicoes: CondicoesExcecaoE10 = {
      reparoConcluidoAntesCancelamento: true,
      pagamentoValido:
        payload.situacaoPagamento === SituacaoPagamentoFinanceira.PAGO_NO_PRAZO,
      semEstorno: payload.situacaoEstorno === SituacaoEstornoFinanceira.NENHUM,
      estoqueConciliado: false,
    };
    snapshot.condicoesE10 = condicoes;
    if (
      payload.situacaoPagamento === SituacaoPagamentoFinanceira.INDETERMINADA
    ) {
      snapshot.aguardandoResposta = true;
      await this.estado.salvar(contexto, snapshot);
      return;
    }
    const todasExcetoEstoque =
      condicoes.reparoConcluidoAntesCancelamento &&
      condicoes.pagamentoValido &&
      condicoes.semEstorno;
    if (!todasExcetoEstoque) {
      snapshot.passo = PassoCompensacaoSaga.FINANCEIRO;
      snapshot.resultadoExecucao = ResultadoExecucaoCompensacao.REPARO_INICIADO;
      await this.estado.salvar(contexto, snapshot);
      await this.avancar(contexto, ordemServicoId, causationId);
      return;
    }
    snapshot.passo = PassoCompensacaoSaga.ESTOQUE;
    await this.estado.salvar(contexto, snapshot);
    await this.avancar(contexto, ordemServicoId, causationId);
  }

  async tratarRespostaCancelamentoFinanceiro(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
    payload: RespostaCancelamentoFinanceiroPayload,
  ): Promise<void> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada || bloqueada.ordem.status !== StatusOS.EM_CANCELAMENTO) {
      return;
    }
    await this.pedidos.marcarConcluidoPorTipo(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.CANCELAR_FINANCEIRO,
    );
    if (payload.resultado === 'PENDENCIA_MANUAL_ABERTA') {
      const cliente = obterClienteTransacao(contexto, this.prisma);
      await cliente.pendenciaOs.create({
        data: {
          id: randomUUID(),
          ordemServicoId,
          rodada: bloqueada.ordem.rodadaVigente,
          tipo: TipoPendenciaOs.FINANCEIRA,
          detalhes: {
            pendenciaId: payload.pendenciaId,
            motivo: 'Cancelamento financeiro com pendência manual',
          },
        },
      });
      const snapshot = await this.estado.obterOuCriar(
        contexto,
        ordemServicoId,
        bloqueada.ordem.rodadaVigente,
      );
      snapshot.aguardandoResposta = false;
      snapshot.passo = PassoCompensacaoSaga.ESTOQUE;
      await this.estado.salvar(contexto, snapshot);
      return;
    }
    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
    );
    snapshot.passo = PassoCompensacaoSaga.ESTOQUE;
    snapshot.aguardandoResposta = false;
    await this.estado.salvar(contexto, snapshot);
    await this.avancar(contexto, ordemServicoId, causationId);
  }

  private async avancar(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
  ): Promise<void> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada || bloqueada.ordem.status !== StatusOS.EM_CANCELAMENTO) {
      return;
    }
    if (await this.temPendenciasAbertas(contexto, ordemServicoId)) {
      return;
    }
    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
    );
    if (snapshot.aguardandoResposta) {
      return;
    }
    switch (snapshot.passo) {
      case PassoCompensacaoSaga.EXECUCAO:
        await this.executarPassoExecucao(
          contexto,
          bloqueada,
          snapshot,
          causationId,
        );
        break;
      case PassoCompensacaoSaga.CONSULTA_E10:
        if (!snapshot.consultaIdVigente) {
          await this.emitirConsultaE10(
            contexto,
            bloqueada,
            causationId,
            snapshot,
          );
        }
        break;
      case PassoCompensacaoSaga.FINANCEIRO:
        await this.executarPassoFinanceiro(
          contexto,
          bloqueada,
          snapshot,
          causationId,
        );
        break;
      case PassoCompensacaoSaga.ESTOQUE:
        await this.executarPassoEstoque(
          contexto,
          bloqueada,
          snapshot,
          causationId,
        );
        break;
      case PassoCompensacaoSaga.ENCERRAMENTO:
        await this.encerrar(contexto, bloqueada, snapshot, causationId);
        break;
      default:
        break;
    }
  }

  private async executarPassoExecucao(
    contexto: ContextoTransacao,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
    snapshot: Awaited<ReturnType<EstadoCompensacaoGateway['obterOuCriar']>>,
    causationId: string,
  ): Promise<void> {
    if (await this.devePularCancelarTarefa(contexto, bloqueada, snapshot)) {
      snapshot.resultadoExecucao = this.resultadoExecucaoDe(snapshot);
      snapshot.passo = PassoCompensacaoSaga.FINANCEIRO;
      await this.estado.salvar(contexto, snapshot);
      await this.avancar(contexto, bloqueada.ordem.id!, causationId);
      return;
    }
    const jaEmitido = await this.pedidos.existeEmitido(
      contexto,
      bloqueada.ordem.id!,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.CANCELAR_TAREFA,
    );
    if (jaEmitido) {
      return;
    }
    const tipoTarefa = await this.resolverTipoTarefaAberta(contexto, bloqueada);
    const motivo = bloqueada.ordem.motivoEncerramento ?? 'Compensação da saga';
    await this.comandos.emitirCancelarTarefa(
      contexto,
      bloqueada,
      causationId,
      tipoTarefa,
      motivo,
    );
    snapshot.aguardandoResposta = true;
    await this.estado.salvar(contexto, snapshot);
  }

  private async executarPassoFinanceiro(
    contexto: ContextoTransacao,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
    snapshot: Awaited<ReturnType<EstadoCompensacaoGateway['obterOuCriar']>>,
    causationId: string,
  ): Promise<void> {
    const precisa =
      bloqueada.ordem.diagnosticoConcluidoEm != null ||
      (await this.iniciarReparoFoiEmitido(
        contexto,
        bloqueada.ordem.id!,
        bloqueada.ordem.rodadaVigente,
      ));
    if (!precisa) {
      snapshot.passo = PassoCompensacaoSaga.ESTOQUE;
      await this.estado.salvar(contexto, snapshot);
      await this.avancar(contexto, bloqueada.ordem.id!, causationId);
      return;
    }
    const jaEmitido = await this.pedidos.existeEmitido(
      contexto,
      bloqueada.ordem.id!,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.CANCELAR_FINANCEIRO,
    );
    if (jaEmitido) {
      return;
    }
    const resultado =
      snapshot.resultadoExecucao ??
      ResultadoExecucaoCompensacao.REPARO_NAO_INICIADO;
    const motivo = bloqueada.ordem.motivoEncerramento ?? 'Compensação da saga';
    await this.comandos.emitirCancelarFinanceiro(
      contexto,
      bloqueada,
      causationId,
      resultado,
      motivo,
    );
    snapshot.aguardandoResposta = true;
    await this.estado.salvar(contexto, snapshot);
  }

  private async executarPassoEstoque(
    contexto: ContextoTransacao,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
    snapshot: Awaited<ReturnType<EstadoCompensacaoGateway['obterOuCriar']>>,
    causationId: string,
  ): Promise<void> {
    const ordemServicoId = bloqueada.ordem.id!;
    const rodada = bloqueada.ordem.rodadaVigente;
    const consumoConciliado =
      await this.reconciliacao.consumoConciliadoNaRodada(
        contexto,
        ordemServicoId,
        rodada,
      );
    try {
      await this.liberar.execute(
        {
          ordemServicoId,
          rodada,
          idempotencyKey: `estoque.liberar:compensacao:${ordemServicoId}:${rodada}`,
        },
        contexto,
      );
    } catch (erro) {
      if (!(erro instanceof ReservaEstoqueNaoEncontradaError)) {
        throw erro;
      }
    }
    if (snapshot.condicoesE10) {
      const condicoes = {
        ...snapshot.condicoesE10,
        estoqueConciliado: consumoConciliado,
      };
      snapshot.condicoesE10 = condicoes;
      if (
        condicoes.reparoConcluidoAntesCancelamento &&
        condicoes.pagamentoValido &&
        condicoes.semEstorno &&
        condicoes.estoqueConciliado
      ) {
        await this.transicoes.aplicar(contexto, {
          ordemServicoId,
          aplicar: (os, quando) =>
            os.registrarExcecaoReparoConcluidoAntesCancelamento(quando),
          observacao: 'Exceção E10 — reparo concluído antes do cancelamento',
        });
        snapshot.passo = PassoCompensacaoSaga.CONCLUIDO;
        await this.estado.salvar(contexto, snapshot);
        return;
      }
    }
    snapshot.passo = PassoCompensacaoSaga.ENCERRAMENTO;
    await this.estado.salvar(contexto, snapshot);
    await this.avancar(contexto, ordemServicoId, causationId);
  }

  private async encerrar(
    contexto: ContextoTransacao,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
    snapshot: Awaited<ReturnType<EstadoCompensacaoGateway['obterOuCriar']>>,
    causationId: string,
  ): Promise<void> {
    if (await this.temPendenciasAbertas(contexto, bloqueada.ordem.id!)) {
      return;
    }
    await this.transicoes.aplicar(contexto, {
      ordemServicoId: bloqueada.ordem.id!,
      aplicar: (os, quando) => {
        os.registrarCancelamentoConcluido(quando);
        os.marcarVeiculoLiberadoParaRetirada();
      },
      observacao: 'Compensação concluída — OS cancelada',
    });
    snapshot.passo = PassoCompensacaoSaga.CONCLUIDO;
    await this.estado.salvar(contexto, snapshot);
    void causationId;
  }

  private async emitirConsultaE10(
    contexto: ContextoTransacao,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
    causationId: string,
    snapshot: Awaited<ReturnType<EstadoCompensacaoGateway['obterOuCriar']>>,
  ): Promise<void> {
    const consultaId = consultaIdExcecaoE10(
      bloqueada.ordem.id!,
      bloqueada.ordem.rodadaVigente,
    );
    snapshot.consultaIdVigente = consultaId;
    snapshot.aguardandoResposta = true;
    await this.estado.salvar(contexto, snapshot);
    await this.comandos.emitirConsultarSituacaoFinanceira(
      contexto,
      bloqueada,
      causationId,
      consultaId,
      FinalidadeConsultaFinanceira.EXCECAO_E10,
    );
  }

  private async resolverTipoTarefaAberta(
    contexto: ContextoTransacao,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
  ): Promise<TipoTarefaCancelamento> {
    const reparo = await this.pedidos.existeEmitido(
      contexto,
      bloqueada.ordem.id!,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.INICIAR_REPARO,
    );
    if (reparo) {
      return TipoTarefaCancelamento.REPARO;
    }
    return TipoTarefaCancelamento.DIAGNOSTICO;
  }

  private async devePularCancelarTarefa(
    contexto: ContextoTransacao,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
    snapshot: Awaited<ReturnType<EstadoCompensacaoGateway['obterOuCriar']>>,
  ): Promise<boolean> {
    if (snapshot.fatoTerminalExecucao) {
      return true;
    }
    const diagnosticoConcluido = Boolean(
      bloqueada.ordem.diagnosticoConcluidoEm,
    );
    const iniciarReparo = await this.iniciarReparoFoiEmitido(
      contexto,
      bloqueada.ordem.id!,
      bloqueada.ordem.rodadaVigente,
    );
    return diagnosticoConcluido && !iniciarReparo;
  }

  private async iniciarReparoFoiEmitido(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const pedido = await cliente.pedidoEmitido.findFirst({
      where: { ordemServicoId, rodada, tipo: TipoPedidoSaga.INICIAR_REPARO },
      select: { id: true },
    });
    return Boolean(pedido);
  }

  private resultadoExecucaoDe(
    snapshot: Awaited<ReturnType<EstadoCompensacaoGateway['obterOuCriar']>>,
  ): ResultadoExecucaoCompensacao {
    if (
      snapshot.reparoIniciadoDuranteCancelamento ||
      snapshot.fatoTerminalExecucao ||
      snapshot.resultadoExecucao ===
        ResultadoExecucaoCompensacao.REPARO_INICIADO
    ) {
      return ResultadoExecucaoCompensacao.REPARO_INICIADO;
    }
    return ResultadoExecucaoCompensacao.REPARO_NAO_INICIADO;
  }

  private async temPendenciasAbertas(
    contexto: ContextoTransacao,
    ordemServicoId: string,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const abertas = await cliente.pendenciaOs.findMany({
      where: { ordemServicoId, resolvida: false },
      select: { id: true, detalhes: true },
    });
    return abertas.some((pendencia) => {
      const detalhes = pendencia.detalhes as Record<string, unknown>;
      return detalhes.natureza !== 'CONSULTA_PRAZO_REFERENCIA';
    });
  }

  private async supersederConsultaPrazoReferencia(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const abertas = await cliente.pendenciaOs.findMany({
      where: {
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
      },
    });
    const agora = new Date();
    for (const pendencia of abertas) {
      const detalhes = pendencia.detalhes as Record<string, unknown>;
      if (detalhes.natureza === 'CONSULTA_PRAZO_REFERENCIA') {
        await cliente.pendenciaOs.update({
          where: { id: pendencia.id },
          data: { resolvida: true, resolvidaEm: agora },
        });
      }
    }
    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      rodada,
    );
    if (snapshot.passo !== PassoCompensacaoSaga.CONSULTA_E10) {
      snapshot.consultaIdVigente = null;
      await this.estado.salvar(contexto, snapshot);
    }
  }
}

function randomCausation(): string {
  return randomUUID();
}
