import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

const clienteMock = {
  id: 'uuid-1',
  nome: 'João Silva',
  cpfCnpj: '52998224725',
  email: 'joao@email.com',
  telefone: '11999999999',
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('ClientesController', () => {
  let controller: ClientesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientesController],
      providers: [{ provide: ClientesService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ClientesController>(ClientesController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      nome: 'João Silva',
      cpfCnpj: '52998224725',
      email: 'joao@email.com',
      telefone: '11999999999',
    };

    it('deve criar um cliente e retornar os dados', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(clienteMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(clienteMock);
    });

    it('deve propagar ConflictException quando cliente já existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [clienteMock],
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
      await controller.findAll(2, 5, 'João');

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(2, 5, 'João');
    });
  });

  describe('findOne', () => {
    it('deve retornar um cliente pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue({ ...clienteMock, veiculos: [] });

      // Act
      const result = await controller.findOne('uuid-1');

      // Assert
      expect(serviceMock.findOne).toHaveBeenCalledWith('uuid-1');
      expect(result).toMatchObject({ id: 'uuid-1' });
    });

    it('deve propagar NotFoundException quando cliente não existe', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o cliente atualizado', async () => {
      // Arrange
      const updated = { ...clienteMock, nome: 'João Atualizado' };
      serviceMock.update.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-1', { nome: 'João Atualizado' });

      // Assert
      expect(serviceMock.update).toHaveBeenCalledWith('uuid-1', { nome: 'João Atualizado' });
      expect(result).toMatchObject({ nome: 'João Atualizado' });
    });

    it('deve propagar NotFoundException quando cliente não existe', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(
        controller.update('uuid-inexistente', { nome: 'Teste' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException quando e-mail já está em uso', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(
        controller.update('uuid-1', { email: 'outro@email.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deve remover um cliente e retornar mensagem de sucesso', async () => {
      // Arrange
      serviceMock.remove.mockResolvedValue({ message: 'Cliente "uuid-1" removido com sucesso.' });

      // Act
      const result = await controller.remove('uuid-1');

      // Assert
      expect(serviceMock.remove).toHaveBeenCalledWith('uuid-1');
      expect(result).toMatchObject({ message: expect.stringContaining('uuid-1') });
    });

    it('deve propagar NotFoundException quando cliente não existe', async () => {
      // Arrange
      serviceMock.remove.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
