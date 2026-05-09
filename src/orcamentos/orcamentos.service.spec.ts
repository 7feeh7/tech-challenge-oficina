import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { PrismaService } from '@/database/prisma.service';
import { StatusOrcamento } from '@/generated/prisma/enums';

const ordemMock = { id: 'ordem-uuid', numero: 1 };
const orcamentoMock = {
  id: 'orcamento-uuid',
  ordemServicoId: 'ordem-uuid',
  valorTotal: '350.00',
  status: StatusOrcamento.AGUARDANDO_APROVACAO,
  observacoes: 'Inclui mão de obra',
  aprovadoEm: null,
  rejeitadoEm: null,
  motivoRejeicao: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const prismaMock = {
  ordemServico: { findUnique: jest.fn() },
  orcamento: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('OrcamentosService', () => {
  let service: OrcamentosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrcamentosService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OrcamentosService>(OrcamentosService);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = { ordemServicoId: 'ordem-uuid', valorTotal: 350 };

    it('deve criar um orçamento com sucesso', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(ordemMock);
      prismaMock.orcamento.create.mockResolvedValue(orcamentoMock);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(prismaMock.orcamento.create).toHaveBeenCalled();
      expect(result).toMatchObject({ valorTotal: 350, status: StatusOrcamento.AGUARDANDO_APROVACAO });
    });

    it('deve lançar NotFoundException quando OS não existe', async () => {
      // Arrange
      prismaMock.ordemServico.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      // Arrange
      prismaMock.orcamento.findMany.mockResolvedValue([orcamentoMock]);
      prismaMock.orcamento.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll(1, 10);

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, totalPages: 1 });
    });

    it('deve filtrar por ordemServicoId', async () => {
      // Arrange
      prismaMock.orcamento.findMany.mockResolvedValue([]);
      prismaMock.orcamento.count.mockResolvedValue(0);

      // Act
      await service.findAll(1, 10, 'ordem-uuid');

      // Assert
      expect(prismaMock.orcamento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ordemServicoId: 'ordem-uuid' } }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar o orçamento pelo id', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(orcamentoMock);

      // Act
      const result = await service.findOne('orcamento-uuid');

      // Assert
      expect(result).toMatchObject({ id: 'orcamento-uuid' });
    });

    it('deve lançar NotFoundException quando não encontrado', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve aprovar o orçamento e registrar aprovadoEm', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(orcamentoMock);
      prismaMock.orcamento.update.mockResolvedValue({
        ...orcamentoMock,
        status: StatusOrcamento.APROVADO,
        aprovadoEm: new Date(),
      });

      // Act
      const result = await service.update('orcamento-uuid', { status: StatusOrcamento.APROVADO });

      // Assert
      expect(result).toMatchObject({ status: StatusOrcamento.APROVADO });
    });

    it('deve rejeitar o orçamento com motivo de rejeição', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(orcamentoMock);
      prismaMock.orcamento.update.mockResolvedValue({
        ...orcamentoMock,
        status: StatusOrcamento.REJEITADO,
        motivoRejeicao: 'Valor elevado',
        rejeitadoEm: new Date(),
      });

      // Act
      const result = await service.update('orcamento-uuid', {
        status: StatusOrcamento.REJEITADO,
        motivoRejeicao: 'Valor elevado',
      });

      // Assert
      expect(result).toMatchObject({ status: StatusOrcamento.REJEITADO });
    });

    it('deve lançar BadRequestException ao rejeitar sem motivo', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(orcamentoMock);

      // Act & Assert
      await expect(
        service.update('orcamento-uuid', { status: StatusOrcamento.REJEITADO }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException quando não encontrado', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('inexistente', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve remover o orçamento', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(orcamentoMock);
      prismaMock.orcamento.delete.mockResolvedValue(orcamentoMock);

      // Act
      const result = await service.remove('orcamento-uuid');

      // Assert
      expect(result).toMatchObject({ message: expect.stringContaining('orcamento-uuid') });
    });

    it('deve lançar NotFoundException quando não encontrado', async () => {
      // Arrange
      prismaMock.orcamento.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
