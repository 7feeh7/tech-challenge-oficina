import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { OrdensServicoService } from './ordens-servico.service';
import { PrismaService } from '@/database/prisma.service';
import { StatusOS } from '@/generated/prisma/enums';

const clienteMock = { id: 'cliente-uuid', nome: 'João Silva' };
const veiculoMock = { id: 'veiculo-uuid', placa: 'ABC1234', modelo: 'Civic', clienteId: 'cliente-uuid' };
const servicoMock = { id: 'servico-uuid', nome: 'Troca de óleo', precoBase: '150.00' };
const pecaMock = { id: 'peca-uuid', codigo: 'FLT-001', nome: 'Filtro', precoUnitario: '29.90', quantidadeEstoque: 10 };

const ordemMock = {
  id: 'ordem-uuid',
  numero: 1,
  status: StatusOS.RECEBIDA,
  clienteId: 'cliente-uuid',
  veiculoId: 'veiculo-uuid',
  descricaoProblema: 'Barulho no motor',
  diagnostico: null,
  iniciadaEm: null,
  finalizadaEm: null,
  entregueEm: null,
  cliente: clienteMock,
  veiculo: veiculoMock,
  servicos: [],
  pecas: [],
  orcamentos: [],
  historicoStatus: [],
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const prismaMock = {
  cliente: { findUnique: jest.fn() },
  veiculo: { findUnique: jest.fn() },
  servico: { findUnique: jest.fn() },
  peca: { findUnique: jest.fn() },
  ordemServico: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  historicoStatusOS: { create: jest.fn() },
};

describe('OrdensServicoService', () => {
  let service: OrdensServicoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdensServicoService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OrdensServicoService>(OrdensServicoService);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      clienteId: 'cliente-uuid',
      veiculoId: 'veiculo-uuid',
      descricaoProblema: 'Barulho no motor',
    };

    it('deve criar uma OS com sucesso', async () => {
      // Arrange
      prismaMock.cliente.findUnique.mockResolvedValue(clienteMock);
      prismaMock.veiculo.findUnique.mockResolvedValue(veiculoMock);
      prismaMock.ordemServico.create.mockResolvedValue(ordemMock);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(prismaMock.ordemServico.create).toHaveBeenCalled();
      expect(result).toMatchObject({ numero: 1, status: StatusOS.RECEBIDA });
    });

    it('deve criar OS com serviços e peças vinculados', async () => {
      // Arrange
      const dtoComItens = {
        ...dto,
        servicos: [{ servicoId: 'servico-uuid', quantidade: 1 }],
        pecas: [{ pecaId: 'peca-uuid', quantidade: 2 }],
      };
      prismaMock.cliente.findUnique.mockResolvedValue(clienteMock);
      prismaMock.veiculo.findUnique.mockResolvedValue(veiculoMock);
      prismaMock.servico.findUnique.mockResolvedValue(servicoMock);
      prismaMock.peca.findUnique.mockResolvedValue(pecaMock);
      prismaMock.ordemServico.create.mockResolvedValue(ordemMock);

      // Act
      const result = await service.create(dtoComItens);

      // Assert
      expect(prismaMock.servico.findUnique).toHaveBeenCalledWith({ where: { id: 'servico-uuid' } });
      expect(prismaMock.peca.findUnique).toHaveBeenCalledWith({ where: { id: 'peca-uuid' } });
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException quando cliente não existe', async () => {
      // Arrange
      prismaMock.cliente.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException quando veículo não existe', async () => {
      // Arrange
      prismaMock.cliente.findUnique.mockResolvedValue(clienteMock);
      prismaMock.veiculo.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando veículo não pertence ao cliente', async () => {
      // Arrange
      prismaMock.cliente.findUnique.mockResolvedValue(clienteMock);
      prismaMock.veiculo.findUnique.mockResolvedValue({ ...veiculoMock, clienteId: 'outro-cliente' });

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada de ordens', async () => {
      // Arrange
      prismaMock.ordemServico.findMany.mockResolvedValue([ordemMock]);
      prismaMock.ordemServico.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll(1, 10);

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    it('deve filtrar por status quando informado', async () => {
      // Arrange
      prismaMock.ordemServico.findMany.mockResolvedValue([]);
      prismaMock.ordemServico.count.mockResolvedValue(0);

      // Act
      await service.findAll(1, 10, StatusOS.EM_EXECUCAO);

      // Assert
      expect(prismaMock.ordemServico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: StatusOS.EM_EXECUCAO } }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar a OS pelo id', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(ordemMock);

      // Act
      const result = await service.findOne('ordem-uuid');

      // Assert
      expect(result).toMatchObject({ id: 'ordem-uuid', numero: 1 });
    });

    it('deve lançar NotFoundException quando OS não existe', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar a OS com sucesso', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(ordemMock);
      prismaMock.ordemServico.update.mockResolvedValue({ ...ordemMock, diagnostico: 'Válvula desgastada' });
      prismaMock.historicoStatusOS.create.mockResolvedValue({});

      // Act
      const result = await service.update('ordem-uuid', { diagnostico: 'Válvula desgastada' });

      // Assert
      expect(result).toMatchObject({ diagnostico: 'Válvula desgastada' });
    });

    it('deve registrar histórico ao mudar status', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(ordemMock);
      prismaMock.ordemServico.update.mockResolvedValue({ ...ordemMock, status: StatusOS.EM_EXECUCAO });
      prismaMock.historicoStatusOS.create.mockResolvedValue({});

      // Act
      await service.update('ordem-uuid', { status: StatusOS.EM_EXECUCAO });

      // Assert
      expect(prismaMock.historicoStatusOS.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ statusNovo: StatusOS.EM_EXECUCAO }) }),
      );
    });

    it('deve lançar NotFoundException quando OS não existe', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('inexistente', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve remover a OS com sucesso', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(ordemMock);
      prismaMock.ordemServico.delete.mockResolvedValue(ordemMock);

      // Act
      const result = await service.remove('ordem-uuid');

      // Assert
      expect(result).toMatchObject({ message: expect.stringContaining('ordem-uuid') });
    });

    it('deve lançar NotFoundException quando OS não existe', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
