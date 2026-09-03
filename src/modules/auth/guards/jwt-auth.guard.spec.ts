import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PerfilUsuario } from '@/shared/generated/prisma/enums';
import { RequisicaoAutenticada } from '../jwt-payload';
import { JwtAuthGuard } from './jwt-auth.guard';

const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
const configService = {
  get: jest.fn().mockReturnValue('segredo-de-teste'),
} as unknown as ConfigService;

const getAllAndOverride = reflector.getAllAndOverride as jest.Mock;
const verifyAsync = jwtService.verifyAsync as jest.Mock;

/** Monta um ExecutionContext e devolve também a request, para inspecionar o `user`. */
function contextoCom(authorization?: string) {
  const request: RequisicaoAutenticada = {
    headers: authorization ? { authorization } : {},
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(jwtService, reflector, configService);

  beforeEach(() => {
    jest.clearAllMocks();
    getAllAndOverride.mockReturnValue(false);
  });

  it('libera rotas marcadas como públicas sem exigir token', async () => {
    getAllAndOverride.mockReturnValue(true);
    const { context } = contextoCom();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('recusa quando não há header Authorization', async () => {
    const { context } = contextoCom();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa quando o esquema não é Bearer', async () => {
    const { context } = contextoCom('Basic abc123');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('recusa quando o token é inválido ou expirado', async () => {
    verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context } = contextoCom('Bearer token-podre');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('aceita o token válido e anexa o payload na request', async () => {
    const payload = {
      sub: 'usuario-1',
      email: 'admin@oficina.com',
      perfil: PerfilUsuario.ADMINISTRADOR,
    };
    verifyAsync.mockResolvedValue(payload);
    const { context, request } = contextoCom('Bearer token-bom');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    // o RolesGuard depende deste `user` para decidir a permissão
    expect(request.user).toEqual(payload);
    expect(verifyAsync).toHaveBeenCalledWith('token-bom', {
      secret: 'segredo-de-teste',
    });
  });
});
