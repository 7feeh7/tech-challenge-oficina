import {
  ehP2002Idempotencia,
  ehP2002ReservaEstoque,
  traduzirErroPrismaInterno,
} from './tratar-erro-prisma-interno';
import { ReservaDuplicadaInternaError } from '../domain/erros-internos';

describe('tratar-erro-prisma-interno', () => {
  it('detecta P2002 de reserva e idempotência', () => {
    expect(
      ehP2002ReservaEstoque({
        code: 'P2002',
        meta: { modelName: 'ReservaEstoque' },
      }),
    ).toBe(true);
    expect(
      ehP2002Idempotencia({
        code: 'P2002',
        meta: { modelName: 'IdempotencyRecord' },
      }),
    ).toBe(true);
  });

  it('repassa erro desconhecido', () => {
    const erro = new Error('x');
    expect(() => traduzirErroPrismaInterno(erro)).toThrow(erro);
    expect(ehP2002ReservaEstoque({ code: 'P2003' })).toBe(false);
  });

  it('traduz reserva duplicada', () => {
    expect(() =>
      traduzirErroPrismaInterno({
        code: 'P2002',
        meta: { modelName: 'ReservaEstoque' },
      }),
    ).toThrow(ReservaDuplicadaInternaError);
  });
});
