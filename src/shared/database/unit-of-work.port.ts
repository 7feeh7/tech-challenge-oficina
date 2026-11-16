export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/** Marca opaca (D3.16). Índice simbólico em vez de `unique symbol` — limitação do compilador TS ao exportar a marca. */
export const ContextoTransacaoMarca = Symbol('ContextoTransacao');

export interface ContextoTransacao {
  readonly [ContextoTransacaoMarca]: undefined;
}

export interface UnitOfWork {
  executar<T>(
    trabalho: (contexto: ContextoTransacao) => Promise<T>,
  ): Promise<T>;
}
