import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MovimentacoesEstoqueController } from './movimentacoes-estoque.controller';
import { MovimentacoesEstoqueService } from './movimentacoes-estoque.service';
import { TipoMovimentacaoEstoque } from '@/generated/prisma/enums';

const movimentacaoMock = {
  id: 'mov-uuid',
  pecaId: 'peca-uuid',
  peca: { id: 'peca-uuid', codigo: 'FLT-001', nome: 'Filtro de óleo' },
  tipo: TipoMovimentacaoEstoque.ENTRADA,
  quantidade: 5,
  ordemServicoId: null,
  observacao: null,
  criadoEm: new Date(),
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
};

describe('MovimentacoesEstoqueController', () => {
  let controller: MovimentacoesEstoqueController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MovimentacoesEstoqueController],
      providers: [{ provide: MovimentacoesEstoqueService, useValue: serviceMock }],
    }).compile();

    controller = module.get<MovimentacoesEstoqueController>(MovimentacoesEstoqueController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      pecaId: 'peca-uuid',
      tipo: TipoMovimentacaoEstoque.ENTRADA,
      quantidade: 5,
    };

    it('deve registrar uma movimentação de entrada', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(movimentacaoMock);

      // Act
      const result = await controller.create(dto as any);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ tipo: TipoMovimentacaoEstoque.ENTRADA });
    });

    it('deve propagar BadRequestException para estoque insuficiente', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new BadRequestException());

      // Act & Assert
      await expect(controller.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('deve propagar NotFoundException quando peça não existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.create(dto as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      // Arrange
      const paginated = {
        data: [movimentacaoMock],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      serviceMock.findAll.mockResolvedValue(paginated);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(1, 10, undefined);
      expect(result.data).toHaveLength(1);
    });

    it('deve filtrar por pecaId', async () => {
      // Arrange
      serviceMock.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });

      // Act
      await controller.findAll(1, 10, 'peca-uuid');

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(1, 10, 'peca-uuid');
    });
  });

  describe('findOne', () => {
    it('deve retornar a movimentação pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue(movimentacaoMock);

      // Act
      const result = await controller.findOne('mov-uuid');

      // Assert
      expect(result).toMatchObject({ id: 'mov-uuid' });
    });

    it('deve propagar NotFoundException quando não encontrada', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
