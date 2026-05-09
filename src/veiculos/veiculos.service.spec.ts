import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VeiculosService } from './veiculos.service';
import { PrismaService } from '@/database/prisma.service';
import { CreateVeiculoDto } from './dto/create-veiculo.dto';

const veiculoMock = {
  id: 'uuid-v1',
  placa: 'ABC1D23',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2023,
  clienteId: 'uuid-c1',
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const clienteMock = {
  id: 'uuid-c1',
  nome: 'João Silva',
};

const prismaMock = {
  veiculo: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  cliente: {
    findUnique: jest.fn(),
  },
};

describe('VeiculosService', () => {
  let service: VeiculosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeiculosService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<VeiculosService>(VeiculosService);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateVeiculoDto = {
      placa: 'ABC1D23',
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2023,
      clienteId: 'uuid-c1',
    };

    it('deve criar um veículo com sucesso', async () => {
      // Arrange
      prismaMock.cliente.findUnique.mockResolvedValue(clienteMock);
      prismaMock.veiculo.findUnique.mockResolvedValue(null);
      prismaMock.veiculo.create.mockResolvedValue(veiculoMock);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(prismaMock.veiculo.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toMatchObject({ placa: 'ABC1D23', clienteId: 'uuid-c1' });
    });

    it('deve lançar NotFoundException se o cliente não existir', async () => {
      // Arrange
      prismaMock.cliente.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException se a placa já estiver cadastrada', async () => {
      // Arrange
      prismaMock.cliente.findUnique.mockResolvedValue(clienteMock);
      prismaMock.veiculo.findUnique.mockResolvedValue(veiculoMock);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada de veículos', async () => {
      // Arrange
      prismaMock.veiculo.findMany.mockResolvedValue([veiculoMock]);
      prismaMock.veiculo.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll(1, 10);

      // Assert
      expect(prismaMock.veiculo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    it('deve calcular skip corretamente para page 2', async () => {
      // Arrange
      prismaMock.veiculo.findMany.mockResolvedValue([]);
      prismaMock.veiculo.count.mockResolvedValue(15);

      // Act
      const result = await service.findAll(2, 10);

      // Assert
      expect(prismaMock.veiculo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.meta).toMatchObject({ total: 15, totalPages: 2 });
    });

    it('deve aplicar filtro de busca quando search é fornecido', async () => {
      // Arrange
      prismaMock.veiculo.findMany.mockResolvedValue([veiculoMock]);
      prismaMock.veiculo.count.mockResolvedValue(1);

      // Act
      await service.findAll(1, 10, 'Corolla');

      // Assert
      expect(prismaMock.veiculo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar um veículo pelo id', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue({ ...veiculoMock, cliente: clienteMock });

      // Act
      const result = await service.findOne('uuid-v1');

      // Assert
      expect(prismaMock.veiculo.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-v1' },
        include: { cliente: { select: { id: true, nome: true } } },
      });
      expect(result).toMatchObject({ id: 'uuid-v1' });
    });

    it('deve lançar NotFoundException se não encontrar', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar um veículo com sucesso', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue({ ...veiculoMock, cliente: clienteMock });
      prismaMock.veiculo.findFirst.mockResolvedValue(null);
      prismaMock.veiculo.update.mockResolvedValue({ ...veiculoMock, modelo: 'Yaris' });

      // Act
      const result = await service.update('uuid-v1', { modelo: 'Yaris' });

      // Assert
      expect(result).toMatchObject({ modelo: 'Yaris' });
    });

    it('deve lançar NotFoundException se o veículo não existir', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('uuid-inexistente', {})).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException se a placa já estiver em uso', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue({ ...veiculoMock, cliente: clienteMock });
      prismaMock.veiculo.findFirst.mockResolvedValue({ id: 'outro-uuid' });

      // Act & Assert
      await expect(
        service.update('uuid-v1', { placa: 'XYZ9W87' }),
      ).rejects.toThrow(ConflictException);
    });

    it('deve lançar NotFoundException se o novo clienteId não existir', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue({ ...veiculoMock, cliente: clienteMock });
      prismaMock.veiculo.findFirst.mockResolvedValue(null);
      prismaMock.cliente.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update('uuid-v1', { clienteId: 'uuid-inexistente' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve remover um veículo com sucesso', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue({ ...veiculoMock, cliente: clienteMock });
      prismaMock.veiculo.delete.mockResolvedValue(veiculoMock);

      // Act
      const result = await service.remove('uuid-v1');

      // Assert
      expect(prismaMock.veiculo.delete).toHaveBeenCalledWith({ where: { id: 'uuid-v1' } });
      expect(result).toMatchObject({ message: expect.stringContaining('uuid-v1') });
    });

    it('deve lançar NotFoundException se o veículo não existir', async () => {
      // Arrange
      prismaMock.veiculo.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
