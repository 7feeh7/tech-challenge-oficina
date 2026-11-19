import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import {
  NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO,
  naturezaPendenciaInventario,
} from '@/modules/reservas-estoque/domain/natureza-pendencia-inventario';
import {
  EvidenciaBillingAusenteError,
  PendenciaNaoElegivelError,
} from './errors/pendencia.errors';
import {
  CHAVE_EVIDENCIA_ESTORNO_BILLING,
  NATUREZA_PENDENCIA_PAGAMENTO_TARDIO,
  NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO,
  TIPO_ESTORNO_INTEGRAL,
  TRATAMENTO_PAGAMENTO_TARDIO_ESTORNO_AUTOMATICO,
} from './natureza-pendencia-financeira';

export enum CasoResolucaoManual {
  SEGUNDO_PAGAMENTO_ESTORNADO = 'SEGUNDO_PAGAMENTO_ESTORNADO',
  PAGAMENTO_TARDIO_ESTORNADO_AUTOMATICAMENTE = 'PAGAMENTO_TARDIO_ESTORNADO_AUTOMATICAMENTE',
  DIVERGENCIA_SOMENTE_FORA_DO_CATALOGO = 'DIVERGENCIA_SOMENTE_FORA_DO_CATALOGO',
}

export interface PendenciaParaResolucaoManual {
  tipo: TipoPendenciaOs;
  resolvida: boolean;
  detalhes: Record<string, unknown>;
}

export interface DecisaoResolucaoManual {
  caso: CasoResolucaoManual;
  evidencia: Record<string, unknown>;
}

export interface DivergenciaDaPendencia {
  pecaId: string;
}

export function divergenciasDaPendencia(
  detalhes: Record<string, unknown>,
): DivergenciaDaPendencia[] {
  return Array.isArray(detalhes.divergencias)
    ? (detalhes.divergencias as DivergenciaDaPendencia[])
    : [];
}

/**
 * Só três casos têm resolução manual: o resto continua exigindo o fluxo que a
 * pendência já tem (fato do Billing, ajuste por peça ou fato terminal).
 * `pecasDivergentesNoCatalogo` só é consultado para `INVENTARIO`.
 */
export function decidirResolucaoManual(
  pendencia: PendenciaParaResolucaoManual,
  pecasDivergentesNoCatalogo: string[],
): DecisaoResolucaoManual {
  if (pendencia.resolvida) {
    throw new PendenciaNaoElegivelError('A pendência já está resolvida.');
  }
  switch (pendencia.tipo) {
    case TipoPendenciaOs.FINANCEIRA:
      return decidirPendenciaFinanceira(pendencia.detalhes);
    case TipoPendenciaOs.INVENTARIO:
      return decidirPendenciaInventario(
        pendencia.detalhes,
        pecasDivergentesNoCatalogo,
      );
    default:
      throw new PendenciaNaoElegivelError(
        'Este tipo de pendência não admite resolução manual.',
      );
  }
}

function decidirPendenciaFinanceira(
  detalhes: Record<string, unknown>,
): DecisaoResolucaoManual {
  if (detalhes.natureza === NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO) {
    return decidirSegundoPagamento(detalhes);
  }
  if (
    detalhes.natureza === NATUREZA_PENDENCIA_PAGAMENTO_TARDIO &&
    detalhes.tratamento === TRATAMENTO_PAGAMENTO_TARDIO_ESTORNO_AUTOMATICO
  ) {
    return {
      caso: CasoResolucaoManual.PAGAMENTO_TARDIO_ESTORNADO_AUTOMATICAMENTE,
      evidencia: { tratamento: detalhes.tratamento },
    };
  }
  throw new PendenciaNaoElegivelError(
    'A pendência financeira não admite resolução manual.',
  );
}

function decidirSegundoPagamento(
  detalhes: Record<string, unknown>,
): DecisaoResolucaoManual {
  const evidencia = detalhes[CHAVE_EVIDENCIA_ESTORNO_BILLING] as
    | Record<string, unknown>
    | undefined;
  if (
    !evidencia ||
    evidencia.orderId !== detalhes.orderId ||
    evidencia.tipoEstorno !== TIPO_ESTORNO_INTEGRAL
  ) {
    throw new EvidenciaBillingAusenteError();
  }
  return {
    caso: CasoResolucaoManual.SEGUNDO_PAGAMENTO_ESTORNADO,
    evidencia: { [CHAVE_EVIDENCIA_ESTORNO_BILLING]: evidencia },
  };
}

function decidirPendenciaInventario(
  detalhes: Record<string, unknown>,
  pecasDivergentesNoCatalogo: string[],
): DecisaoResolucaoManual {
  const divergencias = divergenciasDaPendencia(detalhes);
  if (
    naturezaPendenciaInventario(detalhes) !==
      NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO ||
    divergencias.length === 0 ||
    pecasDivergentesNoCatalogo.length > 0
  ) {
    throw new PendenciaNaoElegivelError(
      'A pendência de inventário só admite resolução manual quando todas as peças divergentes estão fora do catálogo.',
    );
  }
  return {
    caso: CasoResolucaoManual.DIVERGENCIA_SOMENTE_FORA_DO_CATALOGO,
    evidencia: { pecasForaDoCatalogo: divergencias.map((d) => d.pecaId) },
  };
}
