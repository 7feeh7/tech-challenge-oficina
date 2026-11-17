import { ehP2002MensagemProcessada } from './tratar-erro-prisma-mensageria';

describe('ehP2002MensagemProcessada', () => {
  it('reconhece violação única em MensagemProcessada', () => {
    expect(
      ehP2002MensagemProcessada({
        code: 'P2002',
        meta: { modelName: 'MensagemProcessada' },
      }),
    ).toBe(true);
  });

  it('ignora outros modelos e códigos', () => {
    expect(
      ehP2002MensagemProcessada({
        code: 'P2002',
        meta: { modelName: 'IdempotencyRecord' },
      }),
    ).toBe(false);
    expect(ehP2002MensagemProcessada(new Error('x'))).toBe(false);
  });
});
