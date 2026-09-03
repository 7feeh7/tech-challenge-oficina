import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ValidarCredenciaisUseCase } from '@/modules/usuarios/application/use-cases/validar-credenciais.use-case';
import { PerfilUsuario } from '@/modules/usuarios/domain/perfil-usuario';
import { CredenciaisInvalidasError } from '@/modules/usuarios/domain/errors/usuario.errors';
import { Usuario } from '@/modules/usuarios/domain/entities/usuario.entity';
import { AuthService } from './auth.service';

const usuarioMock = new Usuario({
  id: 'uuid-u1',
  nome: 'Admin',
  email: 'admin@oficina.com',
  senhaHash: 'hash-fake',
  perfil: PerfilUsuario.ADMINISTRADOR,
});

const validarCredenciaisMock = {
  execute: jest.fn(),
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
        {
          provide: ValidarCredenciaisUseCase,
          useValue: validarCredenciaisMock,
        },
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

    it('deve retornar o token quando as credenciais são válidas', async () => {
      // Arrange
      validarCredenciaisMock.execute.mockResolvedValue(usuarioMock);
      jwtServiceMock.signAsync.mockResolvedValue('token-fake');

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(validarCredenciaisMock.execute).toHaveBeenCalledWith(loginDto);
      expect(result).toHaveProperty('token', 'token-fake');
    });

    it('deve propagar CredenciaisInvalidasError quando o caso de uso recusa o login', async () => {
      // Arrange
      validarCredenciaisMock.execute.mockRejectedValue(
        new CredenciaisInvalidasError(),
      );

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        CredenciaisInvalidasError,
      );
      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('deve chamar jwtService.signAsync com payload correto', async () => {
      // Arrange
      validarCredenciaisMock.execute.mockResolvedValue(usuarioMock);

      // Act
      await service.login(loginDto);

      // Assert
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        {
          sub: 'uuid-u1',
          email: 'admin@oficina.com',
          perfil: PerfilUsuario.ADMINISTRADOR,
        },
        { secret: 'secret-de-teste' },
      );
    });
  });
});
