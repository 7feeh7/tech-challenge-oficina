export const PRAZO_RESERVA_MINUTOS_PADRAO = 75;

// Prazo inválido (NaN, <= 0 ou fracionário) faria o Billing nascer com a cobrança
// já vencida; por isso cai no padrão de produção em vez de propagar o erro.
export function lerPrazoReservaMinutos(valor: string | undefined): number {
  const prazoMinutos = Number(valor ?? PRAZO_RESERVA_MINUTOS_PADRAO);
  return Number.isInteger(prazoMinutos) && prazoMinutos > 0
    ? prazoMinutos
    : PRAZO_RESERVA_MINUTOS_PADRAO;
}
