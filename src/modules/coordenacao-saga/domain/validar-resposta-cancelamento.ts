import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from './resultado-cancelamento-execucao';
import { SituacaoTarefaCancelamento } from './situacao-tarefa-cancelamento';
import type { RespostaCancelamentoContrato } from './resposta-cancelamento-contrato';

const JUSTIFICATIVA_OBRIGATORIA = new Set(['CONSUMO_ACIMA', 'FORA_DA_LISTA']);

function presente(v: unknown): boolean {
  return v !== undefined && v !== null;
}

function listaConsumo(payload: Record<string, unknown>): boolean {
  return (
    Array.isArray(payload.pecasUtilizadas) ||
    Array.isArray(payload.servicosRealizados) ||
    Array.isArray(payload.divergencias)
  );
}

function validarDivergencias(
  divergencias: RespostaCancelamentoContrato['divergencias'],
  contratoAditivo: boolean,
): void {
  if (!divergencias) {
    return;
  }
  for (const d of divergencias) {
    if (!presente(d.tipo)) {
      if (contratoAditivo) {
        throw new ErroMensagemPermanente(
          'divergencias[].tipo obrigatório no contrato aditivo.',
        );
      }
      continue;
    }
    if (
      JUSTIFICATIVA_OBRIGATORIA.has(d.tipo!) &&
      !String(d.justificativa ?? '').trim()
    ) {
      throw new ErroMensagemPermanente(
        `justificativa obrigatória para divergência ${d.tipo}.`,
      );
    }
  }
}

function exigeListasConsumoReparo(
  resultado: ResultadoCancelamentoExecucao,
  situacao?: SituacaoTarefaCancelamento,
): boolean {
  if (resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA) {
    return true;
  }
  if (resultado === ResultadoCancelamentoExecucao.JA_ENCERRADA) {
    return (
      situacao === SituacaoTarefaCancelamento.CONCLUIDA ||
      situacao === SituacaoTarefaCancelamento.FALHOU ||
      situacao === SituacaoTarefaCancelamento.INTERROMPIDA ||
      situacao === SituacaoTarefaCancelamento.CANCELADA
    );
  }
  return false;
}

export function validarRespostaCancelamento(
  bruto: unknown,
): RespostaCancelamentoContrato {
  if (!bruto || typeof bruto !== 'object') {
    throw new ErroMensagemPermanente(
      'Payload de resposta-cancelamento ausente.',
    );
  }
  const payload = bruto as Record<string, unknown>;
  const tipoTarefa = payload.tipoTarefa as TipoTarefaCancelamento;
  const resultado = payload.resultado as ResultadoCancelamentoExecucao;

  if (
    !Object.values(TipoTarefaCancelamento).includes(tipoTarefa) ||
    !Object.values(ResultadoCancelamentoExecucao).includes(resultado)
  ) {
    throw new ErroMensagemPermanente(
      'tipoTarefa ou resultado inválido em resposta-cancelamento.',
    );
  }

  if (
    tipoTarefa === TipoTarefaCancelamento.DIAGNOSTICO &&
    resultado === ResultadoCancelamentoExecucao.INTERRUPCAO_SOLICITADA
  ) {
    throw new ErroMensagemPermanente(
      'INTERRUPCAO_SOLICITADA só vale para reparo.',
    );
  }

  if (
    tipoTarefa === TipoTarefaCancelamento.REPARO &&
    resultado === ResultadoCancelamentoExecucao.CANCELADA_EM_ANDAMENTO
  ) {
    throw new ErroMensagemPermanente(
      'CANCELADA_EM_ANDAMENTO só vale para diagnóstico.',
    );
  }

  if (
    tipoTarefa === TipoTarefaCancelamento.DIAGNOSTICO &&
    listaConsumo(payload)
  ) {
    throw new ErroMensagemPermanente(
      'Diagnóstico não pode trazer listas de consumo na resposta.',
    );
  }

  if (
    tipoTarefa === TipoTarefaCancelamento.DIAGNOSTICO &&
    presente(payload.fatoTerminalEventId)
  ) {
    throw new ErroMensagemPermanente(
      'Diagnóstico não pode trazer fatoTerminalEventId.',
    );
  }

  const situacao = payload.situacaoTarefa as
    | SituacaoTarefaCancelamento
    | undefined;
  // Resposta sem `situacaoTarefa` é anterior aos campos aditivos (D3.12): não é
  // erro permanente, e a falta de auditoria vira pendência INFORMACAO_INSUFICIENTE
  // na reconciliação (03, regra (c)).
  const contratoAditivo = presente(situacao);

  if (
    resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA &&
    presente(situacao) &&
    situacao !== SituacaoTarefaCancelamento.CONCLUIDA
  ) {
    throw new ErroMensagemPermanente(
      'JA_CONCLUIDA com situacaoTarefa incompatível.',
    );
  }

  if (resultado === ResultadoCancelamentoExecucao.JA_ENCERRADA) {
    if (
      !situacao ||
      !Object.values(SituacaoTarefaCancelamento).includes(situacao)
    ) {
      throw new ErroMensagemPermanente(
        'JA_ENCERRADA exige situacaoTarefa válida.',
      );
    }
  }

  if (
    tipoTarefa === TipoTarefaCancelamento.REPARO &&
    exigeListasConsumoReparo(resultado, situacao)
  ) {
    if (
      !Array.isArray(payload.pecasUtilizadas) ||
      !Array.isArray(payload.servicosRealizados) ||
      !Array.isArray(payload.divergencias)
    ) {
      throw new ErroMensagemPermanente(
        'Reparo JA_CONCLUIDA ou JA_ENCERRADA exige pecasUtilizadas, servicosRealizados e divergencias.',
      );
    }
    validarDivergencias(
      payload.divergencias as RespostaCancelamentoContrato['divergencias'],
      contratoAditivo,
    );
  }

  const precisaEncerrada =
    (resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA &&
      tipoTarefa === TipoTarefaCancelamento.REPARO) ||
    (resultado === ResultadoCancelamentoExecucao.JA_ENCERRADA &&
      (situacao === SituacaoTarefaCancelamento.CONCLUIDA ||
        situacao === SituacaoTarefaCancelamento.FALHOU ||
        situacao === SituacaoTarefaCancelamento.INTERROMPIDA ||
        situacao === SituacaoTarefaCancelamento.CANCELADA)) ||
    (resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA &&
      tipoTarefa === TipoTarefaCancelamento.DIAGNOSTICO);

  if (precisaEncerrada && contratoAditivo && !presente(payload.encerradaEm)) {
    throw new ErroMensagemPermanente(
      'encerradaEm obrigatório para o resultado.',
    );
  }

  if (
    resultado === ResultadoCancelamentoExecucao.JA_CONCLUIDA &&
    tipoTarefa === TipoTarefaCancelamento.REPARO &&
    !presente(payload.concluidaEm)
  ) {
    throw new ErroMensagemPermanente(
      'concluidaEm obrigatório para reparo concluído.',
    );
  }

  if (
    situacao === SituacaoTarefaCancelamento.FALHOU &&
    resultado === ResultadoCancelamentoExecucao.JA_ENCERRADA &&
    (typeof payload.motivo !== 'string' || !payload.motivo.trim())
  ) {
    throw new ErroMensagemPermanente('motivo obrigatório para reparo FALHOU.');
  }

  if (
    presente(payload.fatoTerminalEventId) &&
    situacao === SituacaoTarefaCancelamento.CANCELADA
  ) {
    throw new ErroMensagemPermanente(
      'CANCELADA antes da execução não deve trazer fatoTerminalEventId.',
    );
  }

  return {
    tipoTarefa,
    resultado,
    concluidaEm: payload.concluidaEm as string | undefined,
    situacaoTarefa: situacao,
    encerradaEm: payload.encerradaEm as string | undefined,
    responsavelId: payload.responsavelId as string | undefined,
    motivo: payload.motivo as string | undefined,
    fatoTerminalEventId: payload.fatoTerminalEventId as string | undefined,
    pecasUtilizadas: payload.pecasUtilizadas as
      | { itemId: string; quantidade: number }[]
      | undefined,
    servicosRealizados: payload.servicosRealizados as
      | { itemId: string; quantidade: number }[]
      | undefined,
    divergencias:
      payload.divergencias as RespostaCancelamentoContrato['divergencias'],
  };
}
