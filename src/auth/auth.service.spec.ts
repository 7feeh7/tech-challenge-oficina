import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsuariosService } from '@/usuarios/usuarios.service';
import { PerfilUsuario } from '@/generated/prisma/enums';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

const usuarioMock = {
  id: 'uuid-u1',
  nome: 'Admin',
  email: 'admin@oficina.com',
  senhaHash: 'hash-fake',
  perfil: PerfilUsuario.ADMINISTRADOR,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const usuariosServiceMock = {
  findByEmailParaAuth: jest.fn(),
};

const jwtServiceMock = {
  signAsync: jest.fn().mockResolvedValue('token-fake'),
};

const configServiceMock = {
  get: jest.fn().mockReturnValue('secret-de-teste'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsuariosService, useValue: usuariosServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const loginDto = { email: 'admin@oficina.com', senha: 'senhaSegura123' };

    it('deve retornar accessToken e dados do usuário quando credenciais são válidas', async () => {
      // Arrange
      usuariosServiceMock.findByEmailParaAuth.mockResolvedValue(usuarioMock);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtServiceMock.signAsync.mockResolvedValue('token-fake');

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result).toHaveProperty('token', 'token-fake');
    });

    it('deve lançar UnauthorizedException quando usuário não existe', async () => {
      // Arrange
      usuariosServiceMock.findByEmailParaAuth.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException quando usuário está inativo', async () => {
      // Arrange
      usuariosServiceMock.findByEmailParaAuth.mockResolvedValue({
        ...usuarioMock,
        ativo: false,
      });

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException quando senha é inválida', async () => {
      // Arrange
      usuariosServiceMock.findByEmailParaAuth.mockResolvedValue(usuarioMock);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve chamar jwtService.signAsync com payload correto', async () => {
      // Arrange
      usuariosServiceMock.findByEmailParaAuth.mockResolvedValue(usuarioMock);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // Act
      await service.login(loginDto);

      // Assert
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        {
          sub: usuarioMock.id,
          email: usuarioMock.email,
          perfil: PerfilUsuario.ADMINISTRADOR,
        },
        { secret: 'secret-de-teste' },
      );
    });
  });
});
