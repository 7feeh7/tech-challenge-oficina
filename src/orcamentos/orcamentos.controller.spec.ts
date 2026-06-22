import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrcamentosController } from './orcamentos.controller';
import { OrcamentosService } from './orcamentos.service';
import { StatusOrcamento } from '@/generated/prisma/enums';

const orcamentoMock = {
  id: 'orcamento-uuid',
  ordemServicoId: 'ordem-uuid',
  valorTotal: 350,
  status: StatusOrcamento.AGUARDANDO_APROVACAO,
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('OrcamentosController', () => {
  let controller: OrcamentosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrcamentosController],
      providers: [{ provide: OrcamentosService, useValue: serviceMock }],
    }).compile();

    controller = module.get<OrcamentosController>(OrcamentosController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('deve criar um orçamento', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(orcamentoMock);
      const dto = { ordemServicoId: 'ordem-uuid', valorTotal: 350 };

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ id: 'orcamento-uuid' });
    });

    it('deve propagar NotFoundException quando OS não existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.create({} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      // Arrange
      const paginated = {
        data: [orcamentoMock],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      serviceMock.findAll.mockResolvedValue(paginated);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(1, 10, undefined);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('deve retornar o orçamento pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue(orcamentoMock);

      // Act
      const result = await controller.findOne('orcamento-uuid');

      // Assert
      expect(result).toMatchObject({ id: 'orcamento-uuid' });
    });

    it('deve propagar NotFoundException', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve aprovar o orçamento', async () => {
      // Arrange
      serviceMock.update.mockResolvedValue({
        ...orcamentoMock,
        status: StatusOrcamento.APROVADO,
      });

      // Act
      const result = await controller.update('orcamento-uuid', {
        status: StatusOrcamento.APROVADO,
      });

      // Assert
      expect(result).toMatchObject({ status: StatusOrcamento.APROVADO });
    });

    it('deve propagar BadRequestException ao rejeitar sem motivo', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new BadRequestException());

      // Act & Assert
      await expect(
        controller.update('orcamento-uuid', {
          status: StatusOrcamento.REJEITADO,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deve remover o orçamento', async () => {
      // Arrange
      serviceMock.remove.mockResolvedValue({
        message: 'Orçamento "orcamento-uuid" removido com sucesso.',
      });

      // Act
      const result = await controller.remove('orcamento-uuid');

      // Assert
      expect(result).toMatchObject({
        message: expect.stringContaining('orcamento-uuid'),
      });
    });

    it('deve propagar NotFoundException', async () => {
      // Arrange
      serviceMock.remove.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
