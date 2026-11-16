import {
  correlationIdStorage,
  extractCorrelationId,
  getCorrelationId,
} from './correlation-id.context';

describe('correlation-id.context', () => {
  it('extrai correlation id do header ou gera um novo', () => {
    const fixo = extractCorrelationId({
      'x-correlation-id': 'corr-123',
    });
    expect(fixo).toBe('corr-123');

    const deArray = extractCorrelationId({
      'x-correlation-id': ['  array-id  ', 'ignorado'],
    });
    expect(deArray).toBe('array-id');

    const legado = extractCorrelationId({
      'X-Correlation-Id': 'header-legado',
    });
    expect(legado).toBe('header-legado');
  });

  it('gera novo id quando header vem vazio', () => {
    const gerado = extractCorrelationId({ 'x-correlation-id': '   ' });
    expect(gerado).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('usa correlation id do AsyncLocalStorage quando definido', () => {
    const id = correlationIdStorage.run({ correlationId: 'ctx-9' }, () =>
      getCorrelationId(),
    );

    expect(id).toBe('ctx-9');
  });
});
