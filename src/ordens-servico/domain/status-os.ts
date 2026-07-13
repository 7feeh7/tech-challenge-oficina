export enum StatusOS {
  RECEBIDA = 'RECEBIDA',
  EM_DIAGNOSTICO = 'EM_DIAGNOSTICO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  FINALIZADA = 'FINALIZADA',
  ENTREGUE = 'ENTREGUE',
}

/**
 * RECEBIDA → EM_DIAGNOSTICO → AGUARDANDO_APROVACAO → EM_EXECUCAO → FINALIZADA → ENTREGUE
 * (com os retornos permitidos para reavaliação)
 */
export const TRANSICOES_VALIDAS: Record<StatusOS, StatusOS[]> = {
  [StatusOS.RECEBIDA]: [StatusOS.EM_DIAGNOSTICO, StatusOS.AGUARDANDO_APROVACAO],
  [StatusOS.EM_DIAGNOSTICO]: [StatusOS.AGUARDANDO_APROVACAO, StatusOS.RECEBIDA],
  [StatusOS.AGUARDANDO_APROVACAO]: [
    StatusOS.EM_EXECUCAO,
    StatusOS.EM_DIAGNOSTICO,
  ],
  [StatusOS.EM_EXECUCAO]: [StatusOS.FINALIZADA],
  [StatusOS.FINALIZADA]: [StatusOS.ENTREGUE],
  [StatusOS.ENTREGUE]: [],
};

export function transicaoPermitida(atual: StatusOS, novo: StatusOS): boolean {
  if (atual === novo) return true;
  return TRANSICOES_VALIDAS[atual]?.includes(novo) ?? false;
}

/** Status que tiram a OS da fila de trabalho (exclusão lógica da listagem). */
export const STATUS_ENCERRADOS: StatusOS[] = [
  StatusOS.FINALIZADA,
  StatusOS.ENTREGUE,
];

/** Status que permanecem na fila de trabalho, do mais urgente para o menos. */
export const STATUS_ABERTOS: StatusOS[] = [
  StatusOS.EM_EXECUCAO,
  StatusOS.AGUARDANDO_APROVACAO,
  StatusOS.EM_DIAGNOSTICO,
  StatusOS.RECEBIDA,
];

/**
 * Prioridade da OS na fila: quanto menor o número, mais para cima ela aparece.
 * Em Execução > Aguardando Aprovação > Diagnóstico > Recebida.
 */
export const PRIORIDADE_NA_FILA: Record<StatusOS, number> = {
  [StatusOS.EM_EXECUCAO]: 1,
  [StatusOS.AGUARDANDO_APROVACAO]: 2,
  [StatusOS.EM_DIAGNOSTICO]: 3,
  [StatusOS.RECEBIDA]: 4,
  [StatusOS.FINALIZADA]: 5,
  [StatusOS.ENTREGUE]: 6,
};

export function estaEncerrada(status: StatusOS): boolean {
  return STATUS_ENCERRADOS.includes(status);
}
