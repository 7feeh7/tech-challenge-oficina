import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import { TIPO_ESTORNO_INTEGRAL } from './natureza-pendencia-financeira';

/** Valor de `origemEstorno` do Billing para o estorno de um segundo pagamento. */
export const ORIGEM_ESTORNO_SEGUNDO_PAGAMENTO = 'SEGUNDO_PAGAMENTO';

export interface EstornoConcluidoPayload {
  cobrancaId?: string;
  orderId?: string;
  valorEstornadoCentavos?: number;
  tipoEstorno?: string;
  estornadoEm?: string;
  statusOrderMercadoPago?: string;
  /** Ausente nas mensagens anteriores ao campo aditivo. */
  origemEstorno?: string;
}

export type EvidenciaEstornoBilling = {
  eventId: string;
  cobrancaId?: string;
  orderId?: string;
  valorEstornadoCentavos?: number;
  tipoEstorno?: string;
  estornadoEm?: string;
  statusOrderMercadoPago?: string;
};

export function ehEstornoDeSegundoPagamento(
  payload: EstornoConcluidoPayload,
): boolean {
  return payload.origemEstorno === ORIGEM_ESTORNO_SEGUNDO_PAGAMENTO;
}

export function validarEstornoDeSegundoPagamento(
  payload: EstornoConcluidoPayload,
): void {
  if (!payload.orderId?.trim()) {
    throw new ErroMensagemPermanente(
      'Estorno de segundo pagamento exige orderId.',
    );
  }
  if (payload.tipoEstorno !== TIPO_ESTORNO_INTEGRAL) {
    throw new ErroMensagemPermanente(
      'Estorno de segundo pagamento exige tipoEstorno INTEGRAL.',
    );
  }
}

export function montarEvidenciaEstorno(
  eventId: string,
  payload: EstornoConcluidoPayload,
): EvidenciaEstornoBilling {
  return {
    eventId,
    cobrancaId: payload.cobrancaId,
    orderId: payload.orderId,
    valorEstornadoCentavos: payload.valorEstornadoCentavos,
    tipoEstorno: payload.tipoEstorno,
    estornadoEm: payload.estornadoEm,
    statusOrderMercadoPago: payload.statusOrderMercadoPago,
  };
}

/**
 * Reentrega do mesmo evento é no-op; um estorno posterior (duplicata ou
 * parcial) não substitui a evidência integral já registrada.
 */
export function deveGravarEvidenciaEstorno(
  evidenciaAtual: Partial<EvidenciaEstornoBilling> | undefined,
  eventId: string,
): boolean {
  return (
    evidenciaAtual?.eventId !== eventId &&
    evidenciaAtual?.tipoEstorno !== TIPO_ESTORNO_INTEGRAL
  );
}
