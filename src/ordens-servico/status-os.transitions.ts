import { StatusOS } from '@/generated/prisma/enums';

/**
 * RECEBIDA → EM_DIAGNOSTICO → AGUARDANDO_APROVACAO → EM_EXECUCAO → FINALIZADA → ENTREGUE
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
