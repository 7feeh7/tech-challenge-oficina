import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { PerfilUsuario } from '@/generated/prisma/enums';

const usuarioMock = {
  id: 'uuid-u1',
  nome: 'Maria Souza',
  email: 'maria@oficina.com',
  perfil: PerfilUsuario.ATENDENTE,
  ativo: true,
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('UsuariosController', () => {
  let controller: UsuariosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [{ provide: UsuariosService, useValue: serviceMock }],
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

    it('deve criar um usuário e retornar os dados sem senha', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(usuarioMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).not.toHaveProperty('senhaHash');
      expect(result).toEqual(usuarioMock);
    });

    it('deve propagar ConflictException quando e-mail já existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [usuarioMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      serviceMock.findAll.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(1, 10, undefined);
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar parâmetros de busca e paginação ao service', async () => {
      // Arrange
      serviceMock.findAll.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'Maria');

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(2, 5, 'Maria');
    });
  });

  describe('findOne', () => {
    it('deve retornar um usuário pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue(usuarioMock);

      // Act
      const result = await controller.findOne('uuid-u1');

      // Assert
      expect(serviceMock.findOne).toHaveBeenCalledWith('uuid-u1');
      expect(result).toMatchObject({ id: 'uuid-u1' });
    });

    it('deve propagar NotFoundException quando usuário não existe', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o usuário atualizado', async () => {
      // Arrange
      const updated = { ...usuarioMock, nome: 'Maria Atualizada' };
      serviceMock.update.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-u1', { nome: 'Maria Atualizada' });

      // Assert
      expect(serviceMock.update).toHaveBeenCalledWith('uuid-u1', { nome: 'Maria Atualizada' });
      expect(result).toMatchObject({ nome: 'Maria Atualizada' });
    });

    it('deve propagar NotFoundException quando usuário não existe', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.update('uuid-inexistente', {})).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException quando e-mail já está em uso', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(
        controller.update('uuid-u1', { email: 'outro@oficina.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deve remover um usuário e retornar mensagem de sucesso', async () => {
      // Arrange
      serviceMock.remove.mockResolvedValue({ message: 'Usuário "uuid-u1" removido com sucesso.' });

      // Act
      const result = await controller.remove('uuid-u1');

      // Assert
      expect(serviceMock.remove).toHaveBeenCalledWith('uuid-u1');
      expect(result).toMatchObject({ message: expect.stringContaining('uuid-u1') });
    });

    it('deve propagar NotFoundException quando usuário não existe', async () => {
      // Arrange
      serviceMock.remove.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
