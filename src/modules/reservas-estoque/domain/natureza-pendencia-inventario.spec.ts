import {
  NATUREZA_PENDENCIA_CONFLITO_CONSUMO,
  NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO,
  NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE,
  naturezaPendenciaInventario,
} from './natureza-pendencia-inventario';

describe('naturezaPendenciaInventario', () => {
  it('retorna natureza explícita', () => {
    expect(
      naturezaPendenciaInventario({
        natureza: NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE,
      }),
    ).toBe(NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE);
    expect(
      naturezaPendenciaInventario({
        natureza: NATUREZA_PENDENCIA_CONFLITO_CONSUMO,
      }),
    ).toBe(NATUREZA_PENDENCIA_CONFLITO_CONSUMO);
  });

  it('inferência legada por divergências', () => {
    expect(
      naturezaPendenciaInventario({
        divergencias: [{ tipo: 'CONSUMO_ACIMA' }],
      }),
    ).toBe(NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO);
  });

  it('retorna undefined sem classificação', () => {
    expect(naturezaPendenciaInventario(null)).toBeUndefined();
    expect(naturezaPendenciaInventario(undefined)).toBeUndefined();
    expect(naturezaPendenciaInventario({})).toBeUndefined();
    expect(naturezaPendenciaInventario({ natureza: '' })).toBeUndefined();
    expect(naturezaPendenciaInventario({ divergencias: [] })).toBeUndefined();
  });
});
