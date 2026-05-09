import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServicosService } from './servicos.service';
import { PrismaService } from '@/database/prisma.service';

const servicoMock = {
  id: 'uuid-s1',
  nome: 'Troca de óleo',
  descricao: 'Troca de óleo do motor com filtro',
  precoBase: '150.00',
  tempoEstimadoMin: 60,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const prismaMock = {
  servico: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ServicosService', () => {
  let service: ServicosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicosService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ServicosService>(ServicosService);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      nome: 'Troca de óleo',
      descricao: 'Troca de óleo do motor com filtro',
      precoBase: 150.0,
      tempoEstimadoMin: 60,
    };

    it('deve criar um serviço e retornar o precoBase como número', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue(servicoMock);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(prismaMock.servico.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nome: 'Troca de óleo' }),
        }),
      );
      expect(result.precoBase).toBe(150);
      expect(result).toMatchObject({ id: 'uuid-s1', nome: 'Troca de óleo' });
    });

    it('deve usar ativo=true quando não informado', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue(servicoMock);

      // Act
      await service.create(dto);

      // Assert
      expect(prismaMock.servico.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ativo: true }),
        }),
      );
    });

    it('deve lançar ConflictException se nome já existir', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(servicoMock);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(prismaMock.servico.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada com precoBase como número', async () => {
      // Arrange
      prismaMock.servico.findMany.mockResolvedValue([servicoMock]);
      prismaMock.servico.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll(1, 10);

      // Assert
      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { nome: 'asc' },
        }),
      );
      expect(result.data[0].precoBase).toBe(150);
      expect(result.meta).toMatchObject({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('deve aplicar filtro de busca por nome', async () => {
      // Arrange
      prismaMock.servico.findMany.mockResolvedValue([servicoMock]);
      prismaMock.servico.count.mockResolvedValue(1);

      // Act
      await service.findAll(1, 10, 'óleo');

      // Assert
      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { nome: { contains: 'óleo', mode: 'insensitive' } },
        }),
      );
    });

    it('deve calcular totalPages corretamente para múltiplas páginas', async () => {
      // Arrange
      prismaMock.servico.findMany.mockResolvedValue([]);
      prismaMock.servico.count.mockResolvedValue(25);

      // Act
      const result = await service.findAll(2, 10);

      // Assert
      expect(result.meta).toMatchObject({ total: 25, totalPages: 3, page: 2 });
      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar um serviço pelo id com precoBase como número', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(servicoMock);

      // Act
      const result = await service.findOne('uuid-s1');

      // Assert
      expect(prismaMock.servico.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-s1' },
      });
      expect(result.precoBase).toBe(150);
      expect(result).toMatchObject({ id: 'uuid-s1', nome: 'Troca de óleo' });
    });

    it('deve lançar NotFoundException se serviço não existir', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar os dados de um serviço', async () => {
      // Arrange
      const updated = { ...servicoMock, tempoEstimadoMin: 90 };
      prismaMock.servico.findUnique.mockResolvedValue(servicoMock);
      prismaMock.servico.update.mockResolvedValue(updated);

      // Act
      const result = await service.update('uuid-s1', { tempoEstimadoMin: 90 });

      // Assert
      expect(result).toMatchObject({ tempoEstimadoMin: 90 });
    });

    it('deve verificar conflito de nome ao atualizar', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(servicoMock);
      prismaMock.servico.findFirst.mockResolvedValue({
        id: 'outro-uuid',
        nome: 'Alinhamento',
      });

      // Act & Assert
      await expect(
        service.update('uuid-s1', { nome: 'Alinhamento' }),
      ).rejects.toThrow(ConflictException);
    });

    it('deve atualizar o nome quando não há conflito', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(servicoMock);
      prismaMock.servico.findFirst.mockResolvedValue(null);
      prismaMock.servico.update.mockResolvedValue({
        ...servicoMock,
        nome: 'Troca de óleo sintético',
      });

      // Act
      const result = await service.update('uuid-s1', {
        nome: 'Troca de óleo sintético',
      });

      // Assert
      expect(result).toMatchObject({ nome: 'Troca de óleo sintético' });
    });

    it('deve lançar NotFoundException se serviço não existir', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('uuid-inexistente', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deve remover um serviço com sucesso', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(servicoMock);
      prismaMock.servico.delete.mockResolvedValue(servicoMock);

      // Act
      const result = await service.remove('uuid-s1');

      // Assert
      expect(prismaMock.servico.delete).toHaveBeenCalledWith({
        where: { id: 'uuid-s1' },
      });
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-s1'),
      });
    });

    it('deve lançar NotFoundException se serviço não existir', async () => {
      // Arrange
      prismaMock.servico.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
