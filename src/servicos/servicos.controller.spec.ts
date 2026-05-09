import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServicosController } from './servicos.controller';
import { ServicosService } from './servicos.service';

const servicoMock = {
  id: 'uuid-s1',
  nome: 'Troca de óleo',
  descricao: 'Troca de óleo do motor com filtro',
  precoBase: 150,
  tempoEstimadoMin: 60,
  ativo: true,
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('ServicosController', () => {
  let controller: ServicosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServicosController],
      providers: [{ provide: ServicosService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ServicosController>(ServicosController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      nome: 'Troca de óleo',
      descricao: 'Troca de óleo do motor com filtro',
      precoBase: 150.0,
      tempoEstimadoMin: 60,
    };

    it('deve criar um serviço e retornar os dados', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(servicoMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(servicoMock);
    });

    it('deve propagar ConflictException quando nome já existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [servicoMock],
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
      await controller.findAll(2, 5, 'óleo');

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(2, 5, 'óleo');
    });
  });

  describe('findOne', () => {
    it('deve retornar um serviço pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue(servicoMock);

      // Act
      const result = await controller.findOne('uuid-s1');

      // Assert
      expect(serviceMock.findOne).toHaveBeenCalledWith('uuid-s1');
      expect(result).toMatchObject({ id: 'uuid-s1' });
    });

    it('deve propagar NotFoundException quando serviço não existe', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o serviço atualizado', async () => {
      // Arrange
      const updated = { ...servicoMock, tempoEstimadoMin: 90 };
      serviceMock.update.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-s1', {
        tempoEstimadoMin: 90,
      });

      // Assert
      expect(serviceMock.update).toHaveBeenCalledWith('uuid-s1', {
        tempoEstimadoMin: 90,
      });
      expect(result).toMatchObject({ tempoEstimadoMin: 90 });
    });

    it('deve propagar NotFoundException quando serviço não existe', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.update('uuid-inexistente', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve propagar ConflictException quando nome já está em uso', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new ConflictException());

      // Act & Assert
      await expect(
        controller.update('uuid-s1', { nome: 'Alinhamento' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deve remover um serviço e retornar mensagem de sucesso', async () => {
      // Arrange
      serviceMock.remove.mockResolvedValue({
        message: 'Serviço "uuid-s1" removido com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-s1');

      // Assert
      expect(serviceMock.remove).toHaveBeenCalledWith('uuid-s1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-s1'),
      });
    });

    it('deve propagar NotFoundException quando serviço não existe', async () => {
      // Arrange
      serviceMock.remove.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
