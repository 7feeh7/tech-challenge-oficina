import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PerfilUsuario } from '@/shared/generated/prisma/enums';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const buildContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  it('deve permitir acesso quando não há roles requeridas', () => {
    // Arrange
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    // Act & Assert
    expect(
      guard.canActivate(buildContext({ perfil: PerfilUsuario.ATENDENTE })),
    ).toBe(true);
  });

  it('deve permitir acesso quando o perfil do usuário está incluído', () => {
    // Arrange
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ATENDENTE]);

    // Act & Assert
    expect(
      guard.canActivate(buildContext({ perfil: PerfilUsuario.ATENDENTE })),
    ).toBe(true);
  });

  it('deve lançar ForbiddenException quando o perfil não tem permissão', () => {
    // Arrange
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([PerfilUsuario.ADMINISTRADOR]);

    // Act & Assert
    expect(() =>
      guard.canActivate(buildContext({ perfil: PerfilUsuario.MECANICO })),
    ).toThrow(ForbiddenException);
  });

  it('deve lançar ForbiddenException quando não há usuário autenticado', () => {
    // Arrange
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([PerfilUsuario.ADMINISTRADOR]);

    // Act & Assert
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
