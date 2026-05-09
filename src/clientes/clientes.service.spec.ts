import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { PrismaService } from '@/database/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';

const clienteMock = {
  id: 'uuid-1',
  nome: 'João Silva',
  cpfCnpj: '52998224725',
  email: 'joao@email.com',
  telefone: '11999999999',
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const prismaMock = {
  cliente: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ClientesService', () => {
  let service: ClientesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto: CreateClienteDto = {
      nome: 'João Silva',
      cpfCnpj: '52998224725',
      email: 'joao@email.com',
      telefone: '11999999999',
    };

    it('deve criar um cliente com sucesso', async () => {
      prismaMock.cliente.findFirst.mockResolvedValue(null);
      prismaMock.cliente.create.mockResolvedValue(clienteMock);

      const result = await service.create(dto);

      expect(prismaMock.cliente.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toMatchObject({ id: 'uuid-1', email: 'joao@email.com' });
    });

    it('deve lançar ConflictException se cliente já existir', async () => {
      prismaMock.cliente.findFirst.mockResolvedValue(clienteMock);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada de clientes', async () => {
      prismaMock.cliente.findMany.mockResolvedValue([clienteMock]);
      prismaMock.cliente.count.mockResolvedValue(1);

      const result = await service.findAll(1, 10);

      expect(prismaMock.cliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    it('deve calcular skip corretamente para page 2', async () => {
      prismaMock.cliente.findMany.mockResolvedValue([]);
      prismaMock.cliente.count.mockResolvedValue(15);

      const result = await service.findAll(2, 10);

      expect(prismaMock.cliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.meta).toMatchObject({ total: 15, totalPages: 2 });
    });
  });

  describe('findOne', () => {
    it('deve retornar um cliente pelo id', async () => {
      prismaMock.cliente.findUnique.mockResolvedValue({
        ...clienteMock,
        veiculos: [],
      });

      const result = await service.findOne('uuid-1');

      expect(prismaMock.cliente.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        include: { veiculos: true },
      });
      expect(result).toMatchObject({ id: 'uuid-1' });
    });

    it('deve lançar NotFoundException se não encontrar', async () => {
      prismaMock.cliente.findUnique.mockResolvedValue(null);

      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar um cliente com sucesso', async () => {
      prismaMock.cliente.findUnique.mockResolvedValue({
        ...clienteMock,
        veiculos: [],
      });
      prismaMock.cliente.findFirst.mockResolvedValue(null);
      prismaMock.cliente.update.mockResolvedValue({
        ...clienteMock,
        nome: 'João Atualizado',
      });

      const result = await service.update('uuid-1', { nome: 'João Atualizado' });

      expect(result).toMatchObject({ nome: 'João Atualizado' });
    });

    it('deve lançar NotFoundException se cliente não existir', async () => {
      prismaMock.cliente.findUnique.mockResolvedValue(null);

      await expect(
        service.update('uuid-inexistente', { nome: 'Teste' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException se e-mail já estiver em uso', async () => {
      prismaMock.cliente.findUnique.mockResolvedValue({
        ...clienteMock,
        veiculos: [],
      });
      prismaMock.cliente.findFirst.mockResolvedValue({ id: 'outro-uuid' });

      await expect(
        service.update('uuid-1', { email: 'outro@email.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deve remover um cliente com sucesso', async () => {
      prismaMock.cliente.findUnique.mockResolvedValue({
        ...clienteMock,
        veiculos: [],
      });
      prismaMock.cliente.delete.mockResolvedValue(clienteMock);

      const result = await service.remove('uuid-1');

      expect(prismaMock.cliente.delete).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
      });
      expect(result).toMatchObject({ message: expect.stringContaining('uuid-1') });
    });

    it('deve lançar NotFoundException se cliente não existir', async () => {
      prismaMock.cliente.findUnique.mockResolvedValue(null);

      await expect(service.remove('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
