import { compararTokenSeguro } from './comparar-token-seguro';

describe('compararTokenSeguro', () => {
  it('aceita tokens iguais', () => {
    expect(compararTokenSeguro('abc', 'abc')).toBe(true);
  });

  it('rejeita tokens diferentes', () => {
    expect(compararTokenSeguro('abc', 'abd')).toBe(false);
  });

  it('rejeita comprimentos diferentes sem vazar tempo', () => {
    expect(compararTokenSeguro('a', 'ab')).toBe(false);
  });
});
