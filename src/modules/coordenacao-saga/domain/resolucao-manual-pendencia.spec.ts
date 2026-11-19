import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import {
  EvidenciaBillingAusenteError,
  PendenciaNaoElegivelError,
} from './errors/pendencia.errors';
import {
  CasoResolucaoManual,
  decidirResolucaoManual,
  divergenciasDaPendencia,
} from './resolucao-manual-pendencia';

const evidenciaIntegral = {
  eventId: 'evt-1',
  cobrancaId: 'cob-1',
  orderId: 'ORD-2',
  valorEstornadoCentavos: 500,
  tipoEstorno: 'INTEGRAL',
  estornadoEm: '2026-11-19T10:00:00.000Z',
  statusOrderMercadoPago: 'refunded',
};

function financeira(detalhes: Record<string, unknown>, resolvida = false) {
  return { tipo: TipoPendenciaOs.FINANCEIRA, resolvida, detalhes };
}

function inventario(detalhes: Record<string, unknown>) {
  return { tipo: TipoPendenciaOs.INVENTARIO, resolvida: false, detalhes };
}

const divergencias = [
  { pecaId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0' },
  { pecaId: 'peca-invalida' },
];

describe('decidirResolucaoManual', () => {
  describe('financeira SEGUNDO_PAGAMENTO', () => {
    const segundoPagamento = {
      natureza: 'SEGUNDO_PAGAMENTO',
      orderId: 'ORD-2',
    };

    it('aceita com a evidência de estorno integral do mesmo orderId', () => {
      const decisao = decidirResolucaoManual(
        financeira({
          ...segundoPagamento,
          evidenciaEstornoBilling: evidenciaIntegral,
        }),
        [],
      );

      expect(decisao).toEqual({
        caso: CasoResolucaoManual.SEGUNDO_PAGAMENTO_ESTORNADO,
        evidencia: { evidenciaEstornoBilling: evidenciaIntegral },
      });
    });

    it.each([
      ['sem evidência', undefined],
      ['estorno parcial', { ...evidenciaIntegral, tipoEstorno: 'PARCIAL' }],
      ['orderId diferente', { ...evidenciaIntegral, orderId: 'ORD-9' }],
    ])('recusa com EVIDENCIA_BILLING_AUSENTE: %s', (_nome, evidencia) => {
      expect(() =>
        decidirResolucaoManual(
          financeira({
            ...segundoPagamento,
            ...(evidencia ? { evidenciaEstornoBilling: evidencia } : {}),
          }),
          [],
        ),
      ).toThrow(EvidenciaBillingAusenteError);
    });
  });

  describe('financeira PAGAMENTO_TARDIO', () => {
    it('aceita com tratamento ESTORNO_AUTOMATICO', () => {
      const decisao = decidirResolucaoManual(
        financeira({
          natureza: 'PAGAMENTO_TARDIO',
          tratamento: 'ESTORNO_AUTOMATICO',
        }),
        [],
      );

      expect(decisao).toEqual({
        caso: CasoResolucaoManual.PAGAMENTO_TARDIO_ESTORNADO_AUTOMATICAMENTE,
        evidencia: { tratamento: 'ESTORNO_AUTOMATICO' },
      });
    });

    it.each([
      [
        'PENDENCIA_MANUAL',
        { natureza: 'PAGAMENTO_TARDIO', tratamento: 'PENDENCIA_MANUAL' },
      ],
      ['sem tratamento', { natureza: 'PAGAMENTO_TARDIO' }],
      ['sem natureza', { tratamento: 'ESTORNO_AUTOMATICO' }],
    ])('recusa: %s', (_nome, detalhes) => {
      expect(() => decidirResolucaoManual(financeira(detalhes), [])).toThrow(
        PendenciaNaoElegivelError,
      );
    });
  });

  it('recusa pendência financeira comum', () => {
    expect(() =>
      decidirResolucaoManual(financeira({ cobrancaId: 'cob-1' }), []),
    ).toThrow(PendenciaNaoElegivelError);
  });

  it('recusa pendência já resolvida', () => {
    expect(() =>
      decidirResolucaoManual(
        financeira(
          { natureza: 'PAGAMENTO_TARDIO', tratamento: 'ESTORNO_AUTOMATICO' },
          true,
        ),
        [],
      ),
    ).toThrow(PendenciaNaoElegivelError);
  });

  describe('inventário', () => {
    it('aceita divergência de consumo com todas as peças fora do catálogo', () => {
      const decisao = decidirResolucaoManual(
        inventario({ natureza: 'DIVERGENCIA_CONSUMO', divergencias }),
        [],
      );

      expect(decisao).toEqual({
        caso: CasoResolucaoManual.DIVERGENCIA_SOMENTE_FORA_DO_CATALOGO,
        evidencia: {
          pecasForaDoCatalogo: [
            'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
            'peca-invalida',
          ],
        },
      });
    });

    it('aceita pendência sem natureza explícita, identificada pelas divergências', () => {
      expect(
        decidirResolucaoManual(inventario({ divergencias }), []).caso,
      ).toBe(CasoResolucaoManual.DIVERGENCIA_SOMENTE_FORA_DO_CATALOGO);
    });

    it('recusa quando alguma peça divergente está no catálogo', () => {
      expect(() =>
        decidirResolucaoManual(
          inventario({ natureza: 'DIVERGENCIA_CONSUMO', divergencias }),
          ['a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0'],
        ),
      ).toThrow(PendenciaNaoElegivelError);
    });

    it.each(['INFORMACAO_INSUFICIENTE', 'CONFLITO_CONSUMO'])(
      'recusa a natureza %s',
      (natureza) => {
        expect(() =>
          decidirResolucaoManual(inventario({ natureza, divergencias }), []),
        ).toThrow(PendenciaNaoElegivelError);
      },
    );

    it('recusa divergência de consumo sem divergências registradas', () => {
      expect(() =>
        decidirResolucaoManual(
          inventario({ natureza: 'DIVERGENCIA_CONSUMO', divergencias: [] }),
          [],
        ),
      ).toThrow(PendenciaNaoElegivelError);
    });
  });

  it('recusa tipo de pendência sem resolução manual', () => {
    expect(() =>
      decidirResolucaoManual(
        {
          tipo: 'OUTRO' as TipoPendenciaOs,
          resolvida: false,
          detalhes: {},
        },
        [],
      ),
    ).toThrow(PendenciaNaoElegivelError);
  });
});

describe('divergenciasDaPendencia', () => {
  it('devolve lista vazia sem divergências', () => {
    expect(divergenciasDaPendencia({})).toEqual([]);
  });
});
