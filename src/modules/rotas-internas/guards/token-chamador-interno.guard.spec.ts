import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { TokenChamadorInternoGuard } from './token-chamador-interno.guard';
import { RelacaoChamadorInterno } from '../relacao-chamador-interno';
import { CHAMADOR_INTERNO_KEY } from '../decorators/chamador-interno.decorator';

describe('TokenChamadorInternoGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  const guard = new TokenChamadorInternoGuard(reflector, configService);

  const context = (authorization?: string) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authorization ? { authorization } : {},
        }),
      }),
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get = jest.fn((key: string) => {
      if (key === 'TOKEN_BILLING_OS') return 'token-billing';
      if (key === 'TOKEN_EXECUTION_OS') return 'token-execution';
      if (key === 'TOKEN_AUTH_CPF_OS') return 'token-auth-cpf';
      return undefined;
    });
  });

  it('ignora rotas sem metadado de chamador', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
    expect(guard.canActivate(context('Bearer x'))).toBe(true);
  });

  it('aceita token do chamador correto', () => {
    reflector.getAllAndOverride = jest.fn((key: string) => {
      if (key === CHAMADOR_INTERNO_KEY) return RelacaoChamadorInterno.BILLING;
      return undefined;
    });
    expect(guard.canActivate(context('Bearer token-billing'))).toBe(true);
  });

  it('rejeita token de outro chamador', () => {
    reflector.getAllAndOverride = jest.fn(() => RelacaoChamadorInterno.BILLING);
    expect(() => guard.canActivate(context('Bearer token-execution'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejeita quando token esperado não está configurado', () => {
    configService.get = jest.fn(() => undefined);
    reflector.getAllAndOverride = jest.fn(
      () => RelacaoChamadorInterno.AUTH_CPF,
    );
    expect(() => guard.canActivate(context('Bearer x'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejeita JWT de usuário como credencial interna', async () => {
    const jwtService = new JwtService({
      privateKey: process.env.JWT_PRIVATE_KEY,
      publicKey: process.env.JWT_PUBLIC_KEY,
      signOptions: { algorithm: 'RS256' },
    });
    const jwtUsuario = await jwtService.signAsync({
      sub: 'u1',
      tipo: 'INTERNO',
      email: 'a@b.com',
      perfil: 'ADMINISTRADOR',
    });

    reflector.getAllAndOverride = jest.fn(() => RelacaoChamadorInterno.BILLING);
    expect(() => guard.canActivate(context(`Bearer ${jwtUsuario}`))).toThrow(
      UnauthorizedException,
    );
  });
});
