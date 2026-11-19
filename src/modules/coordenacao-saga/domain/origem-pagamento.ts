import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';

/** Classificação do `PagamentoConfirmado` feita pelo Billing (campo aditivo `origemPagamento`). */
export enum OrigemPagamento {
  PAGAMENTO_LEGITIMO = 'PAGAMENTO_LEGITIMO',
  SEGUNDO_PAGAMENTO = 'SEGUNDO_PAGAMENTO',
}

const ORIGENS_CONHECIDAS: string[] = Object.values(OrigemPagamento);

/**
 * Retorna `null` para a mensagem legada, sem o campo: o OS mantém a
 * classificação própria pelo estado. Qualquer outro valor fora do contrato é
 * violação e não pode ser presumido como legado.
 */
export function lerOrigemPagamento(
  origemPagamento: unknown,
): OrigemPagamento | null {
  if (origemPagamento === undefined) {
    return null;
  }
  if (
    typeof origemPagamento !== 'string' ||
    !ORIGENS_CONHECIDAS.includes(origemPagamento)
  ) {
    throw new ErroMensagemPermanente(
      'origemPagamento fora dos valores PAGAMENTO_LEGITIMO e SEGUNDO_PAGAMENTO.',
    );
  }
  return origemPagamento as OrigemPagamento;
}

/** Segundo pagamento sem `orderId` não tem a que pendência se vincular. */
export function validarSegundoPagamento(orderId: string | undefined): void {
  if (!orderId?.trim()) {
    throw new ErroMensagemPermanente('Segundo pagamento exige orderId.');
  }
}

/** Evidência de estorno do segundo pagamento da mesma order contradiz a classificação como pagamento legítimo. */
export function validarPagamentoLegitimoSemEstorno(
  estornoSegundoPagamentoRegistrado: boolean,
): void {
  if (estornoSegundoPagamentoRegistrado) {
    throw new ErroMensagemPermanente(
      'PagamentoConfirmado PAGAMENTO_LEGITIMO para order com estorno de segundo pagamento registrado.',
    );
  }
}
