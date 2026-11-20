import type { ContextoConsumoEstoque } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from './resultado-cancelamento-execucao';
import { SituacaoTarefaCancelamento } from './situacao-tarefa-cancelamento';
import type { RespostaCancelamentoContrato } from './resposta-cancelamento-contrato';

export function tipoFatoDeSituacao(
  situacao: SituacaoTarefaCancelamento,
): ContextoConsumoEstoque['tipoFato'] | null {
  switch (situacao) {
    case SituacaoTarefaCancelamento.CONCLUIDA:
      return 'REPARO_CONCLUIDO';
    case SituacaoTarefaCancelamento.FALHOU:
      return 'REPARO_FALHOU';
    case SituacaoTarefaCancelamento.INTERROMPIDA:
      return 'REPARO_INTERROMPIDO';
    default:
      return null;
  }
}

export function respostaExigeReconciliacaoConsumo(
  payload: RespostaCancelamentoContrato,
): boolean {
  if (payload.tipoTarefa !== TipoTarefaCancelamento.REPARO) {
    return false;
  }
  if (
    payload.resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA ||
    (payload.resultado === ResultadoCancelamentoExecucao.JA_ENCERRADA &&
      payload.situacaoTarefa &&
      [
        SituacaoTarefaCancelamento.CONCLUIDA,
        SituacaoTarefaCancelamento.FALHOU,
        SituacaoTarefaCancelamento.INTERROMPIDA,
      ].includes(payload.situacaoTarefa))
  ) {
    return true;
  }
  return false;
}

export function respostaAuditoriaInsuficiente(
  payload: RespostaCancelamentoContrato,
): boolean {
  if (!respostaExigeReconciliacaoConsumo(payload)) {
    return false;
  }
  if (!payload.situacaoTarefa) {
    return true;
  }
  if (
    [
      SituacaoTarefaCancelamento.CONCLUIDA,
      SituacaoTarefaCancelamento.FALHOU,
      SituacaoTarefaCancelamento.INTERROMPIDA,
    ].includes(payload.situacaoTarefa) &&
    !payload.fatoTerminalEventId
  ) {
    return true;
  }
  if (!payload.encerradaEm) {
    return true;
  }
  if (
    payload.situacaoTarefa === SituacaoTarefaCancelamento.CONCLUIDA &&
    !payload.fatoTerminalEventId
  ) {
    return true;
  }
  return false;
}

export function montarContextoConsumoDaResposta(
  payload: RespostaCancelamentoContrato,
): ContextoConsumoEstoque | null {
  if (!payload.situacaoTarefa || !payload.fatoTerminalEventId) {
    return null;
  }
  const tipoFato = tipoFatoDeSituacao(payload.situacaoTarefa);
  if (!tipoFato || !payload.encerradaEm) {
    return null;
  }
  const divergenciasFato =
    payload.divergencias?.map((d) => ({
      pecaId: d.itemId,
      quantidadeReservada: d.quantidadePrevista ?? 0,
      quantidadeInformada: d.quantidadeUtilizada ?? 0,
      quantidadePrevista: d.quantidadePrevista,
      quantidadeUtilizada: d.quantidadeUtilizada,
      tipo: d.tipo ?? null,
      observacao: d.observacao ?? null,
      justificativa: d.justificativa ?? null,
      motivo: d.observacao ?? '',
    })) ?? [];

  return {
    eventId: payload.fatoTerminalEventId,
    fatoOcorridoEm: new Date(payload.encerradaEm),
    concluidoEm:
      payload.situacaoTarefa === SituacaoTarefaCancelamento.CONCLUIDA &&
      payload.concluidaEm
        ? new Date(payload.concluidaEm)
        : null,
    responsavelId: payload.responsavelId ?? null,
    tipoFato,
    divergenciasFato,
    consumoEfetivo: payload.pecasUtilizadas ?? [],
    aguardandoFinalizacao:
      tipoFato === 'REPARO_CONCLUIDO' &&
      payload.resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA,
  };
}
