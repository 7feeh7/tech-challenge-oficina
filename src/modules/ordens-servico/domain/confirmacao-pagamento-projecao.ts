// A linha `PAGAMENTO` de `projecoes_financeiras_os` representa a order emitida
// pelo Billing e nunca vira "paga". O pagamento confirmado é uma linha própria,
// com `orderId` prefixado (como no orçamento), porque a unicidade da tabela é
// por OS, rodada e `orderId`.
export const NATUREZA_CONFIRMACAO_PAGAMENTO = 'CONFIRMACAO';
export const PREFIXO_ORDER_CONFIRMADA = 'confirmado:';
