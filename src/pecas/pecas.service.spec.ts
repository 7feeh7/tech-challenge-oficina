import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PecasService } from './pecas.service';
import { PrismaService } from '@/database/prisma.service';

const pecaMock = {
  id: 'uuid-p1',
  codigo: 'FLT-001',
  nome: 'Filtro de óleo',
  descricao: 'Filtro de óleo para motores 1.0 a 2.0',
  precoUnitario: '29.90',
  quantidadeEstoque: 10,
  estoqueMinimo: 2,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const prismaMock = {
  peca: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('PecasService', () => {
  let service: PecasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PecasService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PecasService>(PecasService);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      codigo: 'FLT-001',
      nome: 'Filtro de óleo',
      descricao: 'Filtro de óleo para motores 1.0 a 2.0',
      precoUnitario: 29.9,
      quantidadeEstoque: 10,
      estoqueMinimo: 2,
    };

    it('deve criar uma peça e retornar precoUnitario como número', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(null);
      prismaMock.peca.create.mockResolvedValue(pecaMock);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(prismaMock.peca.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codigo: 'FLT-001',
            nome: 'Filtro de óleo',
          }),
        }),
      );
      expect(result.precoUnitario).toBe(29.9);
      expect(result).toMatchObject({ id: 'uuid-p1', codigo: 'FLT-001' });
    });

    it('deve usar quantidadeEstoque=0 e estoqueMinimo=0 quando não informados', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(null);
      prismaMock.peca.create.mockResolvedValue({
        ...pecaMock,
        quantidadeEstoque: 0,
        estoqueMinimo: 0,
      });

      // Act
      await service.create({
        codigo: 'FLT-002',
        nome: 'Filtro de ar',
        precoUnitario: 15,
      });

      // Assert
      expect(prismaMock.peca.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantidadeEstoque: 0,
            estoqueMinimo: 0,
            ativo: true,
          }),
        }),
      );
    });

    it('deve lançar ConflictException se código já existir', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(prismaMock.peca.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada com precoUnitario como número', async () => {
      // Arrange
      prismaMock.peca.findMany.mockResolvedValue([pecaMock]);
      prismaMock.peca.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll(1, 10);

      // Assert
      expect(prismaMock.peca.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { nome: 'asc' },
        }),
      );
      expect(result.data[0].precoUnitario).toBe(29.9);
      expect(result.meta).toMatchObject({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('deve filtrar por nome e código simultaneamente', async () => {
      // Arrange
      prismaMock.peca.findMany.mockResolvedValue([pecaMock]);
      prismaMock.peca.count.mockResolvedValue(1);

      // Act
      await service.findAll(1, 10, 'filtro');

      // Assert
      expect(prismaMock.peca.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { nome: { contains: 'filtro', mode: 'insensitive' } },
              { codigo: { contains: 'filtro', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('deve calcular totalPages corretamente para múltiplas páginas', async () => {
      // Arrange
      prismaMock.peca.findMany.mockResolvedValue([]);
      prismaMock.peca.count.mockResolvedValue(25);

      // Act
      const result = await service.findAll(3, 10);

      // Assert
      expect(result.meta).toMatchObject({ total: 25, totalPages: 3, page: 3 });
      expect(prismaMock.peca.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar uma peça pelo id com precoUnitario como número', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);

      // Act
      const result = await service.findOne('uuid-p1');

      // Assert
      expect(prismaMock.peca.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-p1' },
      });
      expect(result.precoUnitario).toBe(29.9);
      expect(result).toMatchObject({ id: 'uuid-p1', codigo: 'FLT-001' });
    });

    it('deve lançar NotFoundException se peça não existir', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar os dados de uma peça', async () => {
      // Arrange
      const updated = { ...pecaMock, quantidadeEstoque: 20 };
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);
      prismaMock.peca.update.mockResolvedValue(updated);

      // Act
      const result = await service.update('uuid-p1', { quantidadeEstoque: 20 });

      // Assert
      expect(result).toMatchObject({ quantidadeEstoque: 20 });
    });

    it('deve verificar conflito de código ao atualizar', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);
      prismaMock.peca.findFirst.mockResolvedValue({
        id: 'outro-uuid',
        codigo: 'FLT-002',
      });

      // Act & Assert
      await expect(
        service.update('uuid-p1', { codigo: 'FLT-002' }),
      ).rejects.toThrow(ConflictException);
    });

    it('deve atualizar o código quando não há conflito', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);
      prismaMock.peca.findFirst.mockResolvedValue(null);
      prismaMock.peca.update.mockResolvedValue({
        ...pecaMock,
        codigo: 'FLT-999',
      });

      // Act
      const result = await service.update('uuid-p1', { codigo: 'FLT-999' });

      // Assert
      expect(result).toMatchObject({ codigo: 'FLT-999' });
    });

    it('deve lançar NotFoundException se peça não existir', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('uuid-inexistente', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deve remover uma peça com sucesso', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);
      prismaMock.peca.delete.mockResolvedValue(pecaMock);

      // Act
      const result = await service.remove('uuid-p1');

      // Assert
      expect(prismaMock.peca.delete).toHaveBeenCalledWith({
        where: { id: 'uuid-p1' },
      });
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-p1'),
      });
    });

    it('deve lançar NotFoundException se peça não existir', async () => {
      // Arrange
      prismaMock.peca.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
