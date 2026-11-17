export enum StatusOS {
  RECEBIDA = 'RECEBIDA',
  EM_DIAGNOSTICO = 'EM_DIAGNOSTICO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  AGUARDANDO_PAGAMENTO = 'AGUARDANDO_PAGAMENTO',
  AGUARDANDO_EXECUCAO = 'AGUARDANDO_EXECUCAO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  EM_CANCELAMENTO = 'EM_CANCELAMENTO',
  FINALIZADA = 'FINALIZADA',
  CANCELADA = 'CANCELADA',
  ENTREGUE = 'ENTREGUE',
}

/**
 * Transições aprovadas na saga (02-os-service, D2, exceção E10).
 * Não existe regressão arbitrária nem atalho fora deste mapa.
 */
export const TRANSICOES_VALIDAS: Record<StatusOS, StatusOS[]> = {
  [StatusOS.RECEBIDA]: [StatusOS.EM_DIAGNOSTICO, StatusOS.EM_CANCELAMENTO],
  [StatusOS.EM_DIAGNOSTICO]: [
    StatusOS.RECEBIDA,
    StatusOS.AGUARDANDO_APROVACAO,
    StatusOS.EM_CANCELAMENTO,
  ],
  [StatusOS.AGUARDANDO_APROVACAO]: [
    StatusOS.EM_DIAGNOSTICO,
    StatusOS.AGUARDANDO_PAGAMENTO,
    StatusOS.EM_CANCELAMENTO,
  ],
  [StatusOS.AGUARDANDO_PAGAMENTO]: [
    StatusOS.AGUARDANDO_EXECUCAO,
    StatusOS.EM_CANCELAMENTO,
  ],
  [StatusOS.AGUARDANDO_EXECUCAO]: [
    StatusOS.EM_EXECUCAO,
    StatusOS.EM_CANCELAMENTO,
  ],
  [StatusOS.EM_EXECUCAO]: [StatusOS.FINALIZADA, StatusOS.EM_CANCELAMENTO],
  [StatusOS.EM_CANCELAMENTO]: [StatusOS.FINALIZADA, StatusOS.CANCELADA],
  [StatusOS.FINALIZADA]: [StatusOS.ENTREGUE],
  [StatusOS.CANCELADA]: [],
  [StatusOS.ENTREGUE]: [],
};

export function transicaoPermitida(atual: StatusOS, novo: StatusOS): boolean {
  if (atual === novo) return true;
  return TRANSICOES_VALIDAS[atual]?.includes(novo) ?? false;
}

/** Encerradas: fora da fila de trabalho (D2.27, D1.16). */
export const STATUS_ENCERRADOS: StatusOS[] = [
  StatusOS.FINALIZADA,
  StatusOS.CANCELADA,
  StatusOS.ENTREGUE,
];

export const STATUS_ABERTOS: StatusOS[] = [
  StatusOS.EM_EXECUCAO,
  StatusOS.AGUARDANDO_EXECUCAO,
  StatusOS.AGUARDANDO_PAGAMENTO,
  StatusOS.AGUARDANDO_APROVACAO,
  StatusOS.EM_DIAGNOSTICO,
  StatusOS.RECEBIDA,
  StatusOS.EM_CANCELAMENTO,
];

/**
 * Prioridade persistida na OS (D2.27). Menor número = mais urgente na fila.
 * Único lugar que define o valor: recalculado em toda mudança de status.
 */
export const PRIORIDADE_FILA_POR_STATUS: Record<StatusOS, number> = {
  [StatusOS.EM_EXECUCAO]: 1,
  [StatusOS.AGUARDANDO_EXECUCAO]: 2,
  [StatusOS.AGUARDANDO_PAGAMENTO]: 3,
  [StatusOS.AGUARDANDO_APROVACAO]: 4,
  [StatusOS.EM_DIAGNOSTICO]: 5,
  [StatusOS.RECEBIDA]: 6,
  [StatusOS.EM_CANCELAMENTO]: 7,
  [StatusOS.FINALIZADA]: 900,
  [StatusOS.CANCELADA]: 901,
  [StatusOS.ENTREGUE]: 902,
};

export function prioridadeFilaDoStatus(status: StatusOS): number {
  return PRIORIDADE_FILA_POR_STATUS[status];
}

export function estaEncerrada(status: StatusOS): boolean {
  return STATUS_ENCERRADOS.includes(status);
}

/** Estados em que itens oficiais podem ser editados (D1.7, E5). */
export function itensOficiaisEditaveis(
  status: StatusOS,
  diagnosticoConcluido: boolean,
): boolean {
  return status === StatusOS.EM_DIAGNOSTICO && !diagnosticoConcluido;
}

/** PATCH público: só descricaoProblema em RECEBIDA antes da conclusão do diagnóstico (D2.22). */
export function patchDescricaoProblemaPermitido(
  status: StatusOS,
  diagnosticoConcluido: boolean,
): boolean {
  return status === StatusOS.RECEBIDA && !diagnosticoConcluido;
}

export function desistenciaPermitida(status: StatusOS): boolean {
  return [
    StatusOS.RECEBIDA,
    StatusOS.EM_DIAGNOSTICO,
    StatusOS.AGUARDANDO_APROVACAO,
    StatusOS.AGUARDANDO_PAGAMENTO,
    StatusOS.AGUARDANDO_EXECUCAO,
    StatusOS.EM_EXECUCAO,
  ].includes(status);
}
