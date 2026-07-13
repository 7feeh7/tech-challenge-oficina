import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarUsuarioUseCase } from '@/usuarios/application/use-cases/atualizar-usuario.use-case';
import { BuscarUsuarioUseCase } from '@/usuarios/application/use-cases/buscar-usuario.use-case';
import { CriarUsuarioUseCase } from '@/usuarios/application/use-cases/criar-usuario.use-case';
import { ListarUsuariosUseCase } from '@/usuarios/application/use-cases/listar-usuarios.use-case';
import { RemoverUsuarioUseCase } from '@/usuarios/application/use-cases/remover-usuario.use-case';
import { PerfilUsuario } from '@/usuarios/domain/perfil-usuario';
import {
  EmailUsuarioJaExisteError,
  UsuarioNaoEncontradoError,
} from '@/usuarios/domain/usuario.errors';
import { UsuariosController } from './usuarios.controller';

const usuarioMock = {
  id: 'uuid-u1',
  nome: 'Maria Souza',
  email: 'maria@oficina.com',
  perfil: PerfilUsuario.ATENDENTE,
  ativo: true,
};

const criarUsuarioMock = { execute: jest.fn() };
const listarUsuariosMock = { execute: jest.fn() };
const buscarUsuarioMock = { execute: jest.fn() };
const atualizarUsuarioMock = { execute: jest.fn() };
const removerUsuarioMock = { execute: jest.fn() };

describe('UsuariosController', () => {
  let controller: UsuariosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        { provide: CriarUsuarioUseCase, useValue: criarUsuarioMock },
        { provide: ListarUsuariosUseCase, useValue: listarUsuariosMock },
        { provide: BuscarUsuarioUseCase, useValue: buscarUsuarioMock },
        { provide: AtualizarUsuarioUseCase, useValue: atualizarUsuarioMock },
        { provide: RemoverUsuarioUseCase, useValue: removerUsuarioMock },
      ],
    }).compile();

    controller = module.get<UsuariosController>(UsuariosController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      nome: 'Maria Souza',
      email: 'maria@oficina.com',
      senha: 'senhaSegura123',
      perfil: PerfilUsuario.ATENDENTE,
    };

    it('deve delegar ao caso de uso e retornar os dados sem senha', async () => {
      // Arrange
      criarUsuarioMock.execute.mockResolvedValue(usuarioMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(criarUsuarioMock.execute).toHaveBeenCalledWith(dto);
      expect(result).not.toHaveProperty('senhaHash');
      expect(result).toEqual(usuarioMock);
    });

    it('deve propagar o erro de domínio quando o e-mail já existe', async () => {
      // Arrange
      criarUsuarioMock.execute.mockRejectedValue(
        new EmailUsuarioJaExisteError(),
      );

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        EmailUsuarioJaExisteError,
      );
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [usuarioMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarUsuariosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarUsuariosMock.execute).toHaveBeenCalledWith(1, 10, undefined);
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar parâmetros de busca e paginação ao caso de uso', async () => {
      // Arrange
      listarUsuariosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'Maria');

      // Assert
      expect(listarUsuariosMock.execute).toHaveBeenCalledWith(2, 5, 'Maria');
    });
  });

  describe('findOne', () => {
    it('deve retornar um usuário pelo id', async () => {
      // Arrange
      buscarUsuarioMock.execute.mockResolvedValue(usuarioMock);

      // Act
      const result = await controller.findOne('uuid-u1');

      // Assert
      expect(buscarUsuarioMock.execute).toHaveBeenCalledWith('uuid-u1');
      expect(result).toMatchObject({ id: 'uuid-u1' });
    });

    it('deve propagar o erro de domínio quando o usuário não existe', async () => {
      // Arrange
      buscarUsuarioMock.execute.mockRejectedValue(
        new UsuarioNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        UsuarioNaoEncontradoError,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o usuário atualizado', async () => {
      // Arrange
      const updated = { ...usuarioMock, nome: 'Maria Atualizada' };
      atualizarUsuarioMock.execute.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-u1', {
        nome: 'Maria Atualizada',
      });

      // Assert
      expect(atualizarUsuarioMock.execute).toHaveBeenCalledWith('uuid-u1', {
        nome: 'Maria Atualizada',
      });
      expect(result).toMatchObject({ nome: 'Maria Atualizada' });
    });

    it('deve propagar o erro de domínio quando o usuário não existe', async () => {
      // Arrange
      atualizarUsuarioMock.execute.mockRejectedValue(
        new UsuarioNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.update('uuid-inexistente', {})).rejects.toThrow(
        UsuarioNaoEncontradoError,
      );
    });

    it('deve propagar o erro de domínio quando o e-mail já está em uso', async () => {
      // Arrange
      atualizarUsuarioMock.execute.mockRejectedValue(
        new EmailUsuarioJaExisteError(),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-u1', { email: 'outro@oficina.com' }),
      ).rejects.toThrow(EmailUsuarioJaExisteError);
    });
  });

  describe('remove', () => {
    it('deve remover um usuário e retornar mensagem de sucesso', async () => {
      // Arrange
      removerUsuarioMock.execute.mockResolvedValue({
        message: 'Usuário "uuid-u1" removido com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-u1');

      // Assert
      expect(removerUsuarioMock.execute).toHaveBeenCalledWith('uuid-u1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-u1'),
      });
    });

    it('deve propagar o erro de domínio quando o usuário não existe', async () => {
      // Arrange
      removerUsuarioMock.execute.mockRejectedValue(
        new UsuarioNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(
        UsuarioNaoEncontradoError,
      );
    });
  });
});
