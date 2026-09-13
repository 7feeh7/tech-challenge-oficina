import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwtService = {
    verifyAsync: jest.fn(),
  } as unknown as JwtService;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'segredo';
      if (key === 'JWT_ISSUER') return 'tech-challenge-auth';
      if (key === 'JWT_AUDIENCE') return 'tech-challenge-api';
      return undefined;
    }),
  } as unknown as ConfigService;

  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;

  const guard = new JwtAuthGuard(jwtService, reflector, configService);

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: 'Bearer token' },
      }),
    }),
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aceita token interno valido', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'usuario-1',
      email: 'a@b.com',
      perfil: 'ADMINISTRADOR',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('aceita token de cliente com issuer e audience corretos', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'cliente-1',
      tipo: 'CLIENTE',
      perfil: 'CLIENTE',
      iss: 'tech-challenge-auth',
      aud: 'tech-challenge-api',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejeita token de cliente com audience invalida', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'cliente-1',
      tipo: 'CLIENTE',
      perfil: 'CLIENTE',
      iss: 'tech-challenge-auth',
      aud: 'outra-api',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
