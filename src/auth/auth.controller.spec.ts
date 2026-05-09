import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PerfilUsuario } from '@/generated/prisma/enums';

const authServiceMock = {
  login: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    const loginDto = { email: 'admin@oficina.com', senha: 'senhaSegura123' };
    const loginResponse = {
      accessToken: 'token-fake',
      usuario: {
        id: 'uuid-u1',
        nome: 'Admin',
        email: 'admin@oficina.com',
        perfil: PerfilUsuario.ADMINISTRADOR,
      },
    };

    it('deve retornar accessToken e dados do usuário com login válido', async () => {
      // Arrange
      authServiceMock.login.mockResolvedValue(loginResponse);

      // Act
      const result = await controller.login(loginDto);

      // Assert
      expect(authServiceMock.login).toHaveBeenCalledWith(loginDto);
      expect(result).toHaveProperty('accessToken', 'token-fake');
    });

    it('deve propagar UnauthorizedException quando credenciais inválidas', async () => {
      // Arrange
      authServiceMock.login.mockRejectedValue(new UnauthorizedException());

      // Act & Assert
      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('me', () => {
    it('deve retornar os dados do usuário autenticado a partir do request', () => {
      // Arrange
      const userPayload = {
        sub: 'uuid-u1',
        email: 'admin@oficina.com',
        perfil: PerfilUsuario.ADMINISTRADOR,
      };
      const request = { user: userPayload };

      // Act
      const result = controller.me(request);

      // Assert
      expect(result).toEqual(userPayload);
    });
  });
});
