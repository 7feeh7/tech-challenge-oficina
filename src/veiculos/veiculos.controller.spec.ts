import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VeiculosController } from './veiculos.controller';
import { VeiculosService } from './veiculos.service';

const veiculoMock = {
  id: 'uuid-v1',
  placa: 'ABC1D23',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2023,
  clienteId: 'uuid-c1',
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('VeiculosController', () => {
  let controller: VeiculosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VeiculosController],
      providers: [{ provide: VeiculosService, useValue: serviceMock }],
    }).compile();

    controller = module.get<VeiculosController>(VeiculosController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      placa: 'ABC1D23',
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2023,
      clienteId: 'uuid-c1',
    };

    it('deve criar um veículo e retornar os dados', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(veiculoMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(veiculoMock);
    });

    it('deve propagar NotFoundException quando o cliente não existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException quando a placa já existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [veiculoMock],
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
      await controller.findAll(2, 5, 'Corolla');

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(2, 5, 'Corolla');
    });
  });

  describe('findOne', () => {
    it('deve retornar um veículo pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue({ ...veiculoMock, cliente: { id: 'uuid-c1', nome: 'João' } });

      // Act
      const result = await controller.findOne('uuid-v1');

      // Assert
      expect(serviceMock.findOne).toHaveBeenCalledWith('uuid-v1');
      expect(result).toMatchObject({ id: 'uuid-v1' });
    });

    it('deve propagar NotFoundException quando veículo não existe', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o veículo atualizado', async () => {
      // Arrange
      const updated = { ...veiculoMock, modelo: 'Yaris' };
      serviceMock.update.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-v1', { modelo: 'Yaris' });

      // Assert
      expect(serviceMock.update).toHaveBeenCalledWith('uuid-v1', { modelo: 'Yaris' });
      expect(result).toMatchObject({ modelo: 'Yaris' });
    });

    it('deve propagar NotFoundException quando veículo não existe', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.update('uuid-inexistente', {})).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException quando placa já está em uso', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(controller.update('uuid-v1', { placa: 'XYZ9W87' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deve remover um veículo e retornar mensagem de sucesso', async () => {
      // Arrange
      serviceMock.remove.mockResolvedValue({ message: 'Veículo "uuid-v1" removido com sucesso.' });

      // Act
      const result = await controller.remove('uuid-v1');

      // Assert
      expect(serviceMock.remove).toHaveBeenCalledWith('uuid-v1');
      expect(result).toMatchObject({ message: expect.stringContaining('uuid-v1') });
    });

    it('deve propagar NotFoundException quando veículo não existe', async () => {
      // Arrange
      serviceMock.remove.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
