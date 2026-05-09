import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PecasController } from './pecas.controller';
import { PecasService } from './pecas.service';

const pecaMock = {
  id: 'uuid-p1',
  codigo: 'FLT-001',
  nome: 'Filtro de óleo',
  descricao: 'Filtro de óleo para motores 1.0 a 2.0',
  precoUnitario: 29.9,
  quantidadeEstoque: 10,
  estoqueMinimo: 2,
  ativo: true,
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('PecasController', () => {
  let controller: PecasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PecasController],
      providers: [{ provide: PecasService, useValue: serviceMock }],
    }).compile();

    controller = module.get<PecasController>(PecasController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      codigo: 'FLT-001',
      nome: 'Filtro de óleo',
      precoUnitario: 29.9,
      tempoEstimadoMin: 0,
    };

    it('deve criar uma peça e retornar os dados', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(pecaMock);

      // Act
      const result = await controller.create(dto as any);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(pecaMock);
    });

    it('deve propagar ConflictException quando código já existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(controller.create(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [pecaMock],
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

    it('deve repassar parâmetros de busca ao service', async () => {
      // Arrange
      serviceMock.findAll.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'filtro');

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(2, 5, 'filtro');
    });
  });

  describe('findOne', () => {
    it('deve retornar uma peça pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue(pecaMock);

      // Act
      const result = await controller.findOne('uuid-p1');

      // Assert
      expect(serviceMock.findOne).toHaveBeenCalledWith('uuid-p1');
      expect(result).toMatchObject({ id: 'uuid-p1', codigo: 'FLT-001' });
    });

    it('deve propagar NotFoundException quando peça não existe', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar a peça atualizada', async () => {
      // Arrange
      const updated = { ...pecaMock, quantidadeEstoque: 20 };
      serviceMock.update.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-p1', { quantidadeEstoque: 20 });

      // Assert
      expect(serviceMock.update).toHaveBeenCalledWith('uuid-p1', { quantidadeEstoque: 20 });
      expect(result).toMatchObject({ quantidadeEstoque: 20 });
    });

    it('deve propagar NotFoundException quando peça não existe', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.update('uuid-inexistente', {})).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException quando código já está em uso', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(
        controller.update('uuid-p1', { codigo: 'FLT-002' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deve remover uma peça e retornar mensagem de sucesso', async () => {
      // Arrange
      serviceMock.remove.mockResolvedValue({ message: 'Peça "uuid-p1" removida com sucesso.' });

      // Act
      const result = await controller.remove('uuid-p1');

      // Assert
      expect(serviceMock.remove).toHaveBeenCalledWith('uuid-p1');
      expect(result).toMatchObject({ message: expect.stringContaining('uuid-p1') });
    });

    it('deve propagar NotFoundException quando peça não existe', async () => {
      // Arrange
      serviceMock.remove.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
