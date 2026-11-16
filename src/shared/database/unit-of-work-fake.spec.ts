import { UnitOfWorkFake } from './unit-of-work-fake';
import { ContextoTransacaoMarca } from './unit-of-work.port';

describe('UnitOfWorkFake', () => {
  it('entrega contexto com marca opaca sem abrir transação real', async () => {
    const uow = new UnitOfWorkFake();

    const recebido = await uow.executar((ctx) => {
      expect(ctx[ContextoTransacaoMarca]).toBeUndefined();
      return Promise.resolve('ok');
    });

    expect(recebido).toBe('ok');
  });
});
