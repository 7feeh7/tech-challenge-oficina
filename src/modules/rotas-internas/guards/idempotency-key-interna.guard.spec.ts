import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyKeyInternaGuard } from './idempotency-key-interna.guard';
import { RelacaoChamadorInterno } from '../relacao-chamador-interno';

describe('IdempotencyKeyInternaGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new IdempotencyKeyInternaGuard(reflector);

  const context = (method: string, headers: Record<string, string> = {}) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ method, headers }),
      }),
    }) as never;

  it('exige Idempotency-Key em POST interno', () => {
    reflector.getAllAndOverride = jest.fn((key: string) => {
      if (key === 'chamadorInterno') return RelacaoChamadorInterno.EXECUTION;
      if (key === 'rotaInternaPost') return true;
      return undefined;
    });

    expect(() => guard.canActivate(context('POST'))).toThrow(
      BadRequestException,
    );
  });

  it('não exige chave em GET interno', () => {
    reflector.getAllAndOverride = jest.fn((key: string) => {
      if (key === 'chamadorInterno') return RelacaoChamadorInterno.AUTH_CPF;
      return undefined;
    });

    expect(guard.canActivate(context('GET'))).toBe(true);
  });

  it('libera POST interno com chave', () => {
    reflector.getAllAndOverride = jest.fn((key: string) => {
      if (key === 'chamadorInterno') return RelacaoChamadorInterno.EXECUTION;
      if (key === 'rotaInternaPost') return true;
      return undefined;
    });

    expect(
      guard.canActivate(
        context('POST', { 'idempotency-key': 'diagnostico:abc' }),
      ),
    ).toBe(true);
  });
});
