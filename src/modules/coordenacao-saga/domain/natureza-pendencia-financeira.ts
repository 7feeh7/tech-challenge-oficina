/**
 * Pendência financeira informativa do segundo pagamento: fica aberta e visível
 * até o tratamento manual, não bloqueia a finalização após inventário nem a
 * compensação, e nenhum fato do Billing a resolve.
 */
export const NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO = 'SEGUNDO_PAGAMENTO';

/**
 * Pendência financeira de `PagamentoTardioRegistrado`: a natureza e o
 * `tratamento` do Billing são gravados na abertura para que a resolução manual
 * reconheça só o estorno que o Billing já confirmou por conta própria.
 */
export const NATUREZA_PENDENCIA_PAGAMENTO_TARDIO = 'PAGAMENTO_TARDIO';
export const TRATAMENTO_PAGAMENTO_TARDIO_ESTORNO_AUTOMATICO =
  'ESTORNO_AUTOMATICO';

/** Chave de `detalhes` com o estorno do segundo pagamento confirmado pelo Billing. */
export const CHAVE_EVIDENCIA_ESTORNO_BILLING = 'evidenciaEstornoBilling';
export const TIPO_ESTORNO_INTEGRAL = 'INTEGRAL';

/** Chave de `detalhes` com o `PagamentoConfirmado` da order de segundo pagamento (que abriu a pendência ou chegou depois do estorno). */
export const CHAVE_PAGAMENTO_CONFIRMADO_POSTERIOR = 'pagamentoConfirmado';
