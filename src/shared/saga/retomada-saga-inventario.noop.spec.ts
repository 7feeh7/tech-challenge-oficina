import { RetomadaSagaInventarioNoop } from './retomada-saga-inventario.port';

describe('RetomadaSagaInventarioNoop', () => {
  it('não executa retomada', async () => {
    const noop = new RetomadaSagaInventarioNoop();
    await expect(
      noop.retomarAposResolucaoInventario({}, 'os', 'evt'),
    ).resolves.toBeUndefined();
  });
});
