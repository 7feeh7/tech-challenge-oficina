import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnershipGuard } from './ownership.guard';
import { OwnershipResource } from '../decorators/ownership.decorator';

describe('OwnershipGuard', () => {
  const prisma = {
    ordemServico: { findUnique: jest.fn() },
  };

  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new OwnershipGuard(reflector, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride = jest.fn();
  });

  it('bloqueia cliente acessando OS de outro cliente', async () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(OwnershipResource.ORDEM_SERVICO);
    prisma.ordemServico.findUnique.mockResolvedValue({ clienteId: 'outro' });

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'cliente-1', tipo: 'CLIENTE', perfil: 'CLIENTE' },
          params: { id: 'os-1' },
        }),
      }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('libera rota sem metadado de posse', async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { perfil: 'ADMINISTRADOR' }, params: {} }),
      }),
    } as never;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('libera colaborador da oficina mesmo em rota com posse', async () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(OwnershipResource.ORDEM_SERVICO);

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'admin', perfil: 'ADMINISTRADOR' },
          params: { id: 'os-1' },
        }),
      }),
    } as never;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.ordemServico.findUnique).not.toHaveBeenCalled();
  });

  it('rejeita cliente sem id de recurso', async () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(OwnershipResource.ORDEM_SERVICO);

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'cliente-1', tipo: 'CLIENTE', perfil: 'CLIENTE' },
          params: {},
        }),
      }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite cliente acessando propria OS', async () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(OwnershipResource.ORDEM_SERVICO);
    prisma.ordemServico.findUnique.mockResolvedValue({
      clienteId: 'cliente-1',
    });

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'cliente-1', tipo: 'CLIENTE', perfil: 'CLIENTE' },
          params: { id: 'os-1' },
        }),
      }),
    } as never;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
