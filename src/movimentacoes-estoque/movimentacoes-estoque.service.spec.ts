import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MovimentacoesEstoqueService } from './movimentacoes-estoque.service';
import { PrismaService } from '@/database/prisma.service';
import { TipoMovimentacaoEstoque } from '@/generated/prisma/enums';

const pecaMock = {
  id: 'peca-uuid',
  codigo: 'FLT-001',
  nome: 'Filtro de óleo',
  precoUnitario: '29.90',
  quantidadeEstoque: 10,
};

const movimentacaoMock = {
  id: 'mov-uuid',
  pecaId: 'peca-uuid',
  tipo: TipoMovimentacaoEstoque.ENTRADA,
  quantidade: 5,
  ordemServicoId: null,
  observacao: null,
  criadoEm: new Date(),
  peca: { id: 'peca-uuid', codigo: 'FLT-001', nome: 'Filtro de óleo' },
};

const prismaMock = {
  peca: { findUnique: jest.fn(), update: jest.fn() },
  movimentacaoEstoque: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('MovimentacoesEstoqueService', () => {
  let service: MovimentacoesEstoqueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovimentacoesEstoqueService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<MovimentacoesEstoqueService>(
      MovimentacoesEstoqueService,
    );
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dtoEntrada = {
      pecaId: 'peca-uuid',
      tipo: TipoMovimentacaoEstoque.ENTRADA,
      quantidade: 5,
    };

    it('deve registrar entrada de estoque com sucesso', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);
      prismaMock.$transaction.mockResolvedValue([movimentacaoMock, pecaMock]);

      // Act
      const result = await service.create(dtoEntrada);

      // Assert
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toMatchObject({
        tipo: TipoMovimentacaoEstoque.ENTRADA,
        quantidade: 5,
      });
    });

    it('deve registrar baixa de estoque com sucesso', async () => {
      // Arrange
      const dtoBaixa = {
        ...dtoEntrada,
        tipo: TipoMovimentacaoEstoque.BAIXA,
        quantidade: 3,
      };
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);
      prismaMock.$transaction.mockResolvedValue([
        {
          ...movimentacaoMock,
          tipo: TipoMovimentacaoEstoque.BAIXA,
          quantidade: 3,
        },
        pecaMock,
      ]);

      // Act
      const result = await service.create(dtoBaixa);

      // Assert
      expect(result).toMatchObject({ tipo: TipoMovimentacaoEstoque.BAIXA });
    });

    it('deve lançar BadRequestException quando estoque insuficiente para baixa', async () => {
      // Arrange
      const dtoBaixa = {
        ...dtoEntrada,
        tipo: TipoMovimentacaoEstoque.BAIXA,
        quantidade: 20,
      };
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock); // quantidadeEstoque: 10

      // Act & Assert
      await expect(service.create(dtoBaixa)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar NotFoundException quando peça não existe', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(dtoEntrada)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada de movimentações', async () => {
      // Arrange
      prismaMock.movimentacaoEstoque.findMany.mockResolvedValue([
        movimentacaoMock,
      ]);
      prismaMock.movimentacaoEstoque.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll(1, 10);

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('deve filtrar por pecaId quando informado', async () => {
      // Arrange
      prismaMock.movimentacaoEstoque.findMany.mockResolvedValue([]);
      prismaMock.movimentacaoEstoque.count.mockResolvedValue(0);

      // Act
      await service.findAll(1, 10, 'peca-uuid');

      // Assert
      expect(prismaMock.movimentacaoEstoque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { pecaId: 'peca-uuid' } }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar a movimentação pelo id', async () => {
      // Arrange
      prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue(
        movimentacaoMock,
      );

      // Act
      const result = await service.findOne('mov-uuid');

      // Assert
      expect(result).toMatchObject({
        id: 'mov-uuid',
        tipo: TipoMovimentacaoEstoque.ENTRADA,
      });
    });

    it('deve lançar NotFoundException quando não encontrada', async () => {
      // Arrange
      prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
