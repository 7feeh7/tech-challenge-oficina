import {
  type ContextoTransacao,
  ContextoTransacaoMarca,
  type UnitOfWork,
} from './unit-of-work.port';

const contextoFalso: ContextoTransacao = {
  [ContextoTransacaoMarca]: undefined,
};

export class UnitOfWorkFake implements UnitOfWork {
  async executar<T>(
    trabalho: (contexto: ContextoTransacao) => Promise<T>,
  ): Promise<T> {
    return trabalho(contextoFalso);
  }
}
