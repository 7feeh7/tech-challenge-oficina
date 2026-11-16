import { normalizeRoute } from './normalize-route';

describe('normalizeRoute', () => {
  it('substitui UUID e id numérico na rota', () => {
    const url =
      '/v1/ordens-servico/a1b2c3d4-e5f6-4112-8901-abcdefabcdef/pecas/42?filtro=1';

    expect(normalizeRoute(url)).toBe('/v1/ordens-servico/:id/pecas/:id');
  });

  it('mantém rota sem identificadores', () => {
    expect(normalizeRoute('/v1/health')).toBe('/v1/health');
  });

  it('trata URL com query sem path prefixado', () => {
    expect(normalizeRoute('?somente=query')).toBe('');
  });
});
