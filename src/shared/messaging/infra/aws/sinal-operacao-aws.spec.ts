import { sinalOperacaoAws } from './sinal-operacao-aws';

describe('sinalOperacaoAws', () => {
  it('combina deadline com sinal externo', () => {
    const externo = new AbortController();
    const sinal = sinalOperacaoAws(60_000, externo.signal);
    expect(sinal.aborted).toBe(false);
    externo.abort();
    expect(sinal.aborted).toBe(true);
  });
});
