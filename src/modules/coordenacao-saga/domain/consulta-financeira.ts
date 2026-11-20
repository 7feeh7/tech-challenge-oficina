export enum FinalidadeConsultaFinanceira {
  PRAZO_DE_REFERENCIA_VENCIDO = 'PRAZO_DE_REFERENCIA_VENCIDO',
  EXCECAO_E10 = 'EXCECAO_E10',
}

export enum SituacaoPagamentoFinanceira {
  PAGO_NO_PRAZO = 'PAGO_NO_PRAZO',
  SEM_PAGAMENTO = 'SEM_PAGAMENTO',
  INDETERMINADA = 'INDETERMINADA',
}

export enum SituacaoEstornoFinanceira {
  NENHUM = 'NENHUM',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDO = 'CONCLUIDO',
  INDETERMINADO = 'INDETERMINADO',
}

export interface CondicoesExcecaoE10 {
  reparoConcluidoAntesCancelamento: boolean;
  pagamentoValido: boolean;
  semEstorno: boolean;
  estoqueConciliado: boolean;
}

export function consultaIdExcecaoE10(
  ordemServicoId: string,
  rodada: number,
  tentativa = 1,
): string {
  return `${ordemServicoId}#${rodada}#excecao-e10#${tentativa}`;
}

export function consultaIdPrazoReferencia(
  ordemServicoId: string,
  rodada: number,
  tentativa: number,
): string {
  return `${ordemServicoId}#${rodada}#consulta#${tentativa}`;
}
