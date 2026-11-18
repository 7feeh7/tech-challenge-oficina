/** Marca operação de negócio disparada em concorrência (use com `arbitroConcorrente`). */
export function operacaoConcorrente<T>(operacao: Promise<T>): Promise<T> {
  return operacao;
}

/** Registra `allSettled` logo após disparar as operações (antes de `liberar`). */
export function arbitroConcorrente(
  ...operacoes: Promise<unknown>[]
): Promise<PromiseSettledResult<unknown>[]> {
  return Promise.allSettled(operacoes);
}

async function aguardarTicks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

/** Falha se a promise concluir antes do fim da espera curta (op ainda aguardando bloqueio). */
export async function assertOperacaoAindaPendente(
  operacao: Promise<unknown>,
): Promise<void> {
  const estado = await Promise.race([
    operacao.then(
      () => 'concluiu' as const,
      () => 'concluiu' as const,
    ),
    aguardarTicks(2).then(() => 'pendente' as const),
  ]);
  if (estado === 'concluiu') {
    throw new Error('Operação concluiu antes da liberação do bloqueio da OS');
  }
}
