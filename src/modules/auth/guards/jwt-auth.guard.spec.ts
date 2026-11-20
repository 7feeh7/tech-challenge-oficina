import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwtService = {
    verifyAsync: jest.fn(),
  } as unknown as JwtService;

  const configPadrao = (key: string) => {
    if (key === 'JWT_PUBLIC_KEY') return process.env.JWT_PUBLIC_KEY;
    if (key === 'JWT_ISSUER') return 'tech-challenge-auth';
    if (key === 'JWT_AUDIENCE') return 'tech-challenge-api';
    return undefined;
  };

  const configService = {
    get: jest.fn(configPadrao),
    getOrThrow: jest.fn(configPadrao),
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
    configService.get = jest.fn(configPadrao);
    configService.getOrThrow = jest.fn(configPadrao);
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    jwtService.verifyAsync = jest.fn();
  });

  it('verifica token com RS256 e chave pública', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'usuario-1',
      email: 'a@b.com',
      perfil: 'ADMINISTRADOR',
      iss: 'tech-challenge-auth',
      aud: 'tech-challenge-api',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ algorithms: ['RS256'] }),
    );
  });

  it('aceita token interno valido', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'usuario-1',
      email: 'a@b.com',
      perfil: 'ADMINISTRADOR',
      iss: 'tech-challenge-auth',
      aud: 'tech-challenge-api',
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

  it('libera rota pública sem validar token', async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejeita requisição sem Bearer', async () => {
    const semToken = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as never;

    await expect(guard.canActivate(semToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token interno sem e-mail', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'usuario-1',
      perfil: 'ADMINISTRADOR',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token de cliente com issuer inválido', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'cliente-1',
      tipo: 'CLIENTE',
      perfil: 'CLIENTE',
      iss: 'outro-issuer',
      aud: 'tech-challenge-api',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token interno com issuer inválido', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'usuario-1',
      email: 'a@b.com',
      perfil: 'ADMINISTRADOR',
      iss: 'outro-issuer',
      aud: 'tech-challenge-api',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('aceita audience de cliente informada como array', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'cliente-1',
      tipo: 'CLIENTE',
      perfil: 'CLIENTE',
      iss: 'tech-challenge-auth',
      aud: ['outra', 'tech-challenge-api'],
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('aceita token de cliente quando audience não está configurada', async () => {
    configService.get = jest.fn((key: string) => {
      if (key === 'JWT_PUBLIC_KEY') return process.env.JWT_PUBLIC_KEY;
      if (key === 'JWT_ISSUER') return 'tech-challenge-auth';
      return undefined;
    });
    configService.getOrThrow = jest.fn((key: string) => {
      if (key === 'JWT_PUBLIC_KEY') return process.env.JWT_PUBLIC_KEY;
      return undefined;
    });

    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'cliente-1',
      tipo: 'CLIENTE',
      perfil: 'CLIENTE',
      iss: 'tech-challenge-auth',
      aud: 'qualquer',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejeita token inválido na verificação', async () => {
    jwtService.verifyAsync = jest
      .fn()
      .mockRejectedValue(new Error('jwt malformed'));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token de cliente com tipo ou perfil incorreto', async () => {
    jwtService.verifyAsync = jest.fn().mockResolvedValue({
      sub: 'cliente-1',
      tipo: 'CLIENTE',
      perfil: 'ADMINISTRADOR',
      iss: 'tech-challenge-auth',
      aud: 'tech-challenge-api',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
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

  it('rejeita HS256 na verificação real', async () => {
    const hs = sign(
      { sub: 'u', email: 'a@b.com', perfil: 'ADMINISTRADOR' },
      'segredo-hs256',
      { algorithm: 'HS256' },
    );
    const jwtReal = new JwtService({
      publicKey: process.env.JWT_PUBLIC_KEY,
      verifyOptions: { algorithms: ['RS256'] },
    });
    const guardReal = new JwtAuthGuard(jwtReal, reflector, configService);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${hs}` } }),
      }),
    } as never;

    await expect(guardReal.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
