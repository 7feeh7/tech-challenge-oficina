import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrdensServicoController } from './ordens-servico.controller';
import { OrdensServicoService } from './ordens-servico.service';
import { StatusOS } from '@/generated/prisma/enums';

const ordemMock = {
  id: 'ordem-uuid',
  numero: 1,
  status: StatusOS.RECEBIDA,
  cliente: { id: 'cliente-uuid', nome: 'João Silva' },
  veiculo: { id: 'veiculo-uuid', placa: 'ABC1234', modelo: 'Civic' },
  descricaoProblema: 'Barulho no motor',
  servicos: [],
  pecas: [],
};

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('OrdensServicoController', () => {
  let controller: OrdensServicoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdensServicoController],
      providers: [{ provide: OrdensServicoService, useValue: serviceMock }],
    }).compile();

    controller = module.get<OrdensServicoController>(OrdensServicoController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = { clienteId: 'cliente-uuid', veiculoId: 'veiculo-uuid' };

    it('deve criar uma OS e retornar os dados', async () => {
      // Arrange
      serviceMock.create.mockResolvedValue(ordemMock);

      // Act
      const result = await controller.create(dto as any);

      // Assert
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ numero: 1, status: StatusOS.RECEBIDA });
    });

    it('deve propagar BadRequestException quando veículo não pertence ao cliente', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new BadRequestException());

      // Act & Assert
      await expect(controller.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('deve propagar NotFoundException quando cliente não existe', async () => {
      // Arrange
      serviceMock.create.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.create(dto as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      // Arrange
      const paginated = { data: [ordemMock], meta: { total: 1, page: 1, limit: 10, totalPages: 1 } };
      serviceMock.findAll.mockResolvedValue(paginated);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(1, 10, undefined);
      expect(result.data).toHaveLength(1);
    });

    it('deve filtrar por status', async () => {
      // Arrange
      serviceMock.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });

      // Act
      await controller.findAll(1, 10, StatusOS.EM_EXECUCAO);

      // Assert
      expect(serviceMock.findAll).toHaveBeenCalledWith(1, 10, StatusOS.EM_EXECUCAO);
    });
  });

  describe('findOne', () => {
    it('deve retornar a OS pelo id', async () => {
      // Arrange
      serviceMock.findOne.mockResolvedValue(ordemMock);

      // Act
      const result = await controller.findOne('ordem-uuid');

      // Assert
      expect(result).toMatchObject({ id: 'ordem-uuid' });
    });

    it('deve propagar NotFoundException', async () => {
      // Arrange
      serviceMock.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar a OS', async () => {
      // Arrange
      const updated = { ...ordemMock, status: StatusOS.EM_EXECUCAO };
      serviceMock.update.mockResolvedValue(updated);

      // Act
      const result = await controller.update('ordem-uuid', { status: StatusOS.EM_EXECUCAO });

      // Assert
      expect(result).toMatchObject({ status: StatusOS.EM_EXECUCAO });
    });

    it('deve propagar NotFoundException quando OS não existe', async () => {
      // Arrange
      serviceMock.update.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.update('inexistente', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve remover a OS', async () => {
      // Arrange
      serviceMock.remove.mockResolvedValue({ message: 'Ordem de serviço "ordem-uuid" removida com sucesso.' });

      // Act
      const result = await controller.remove('ordem-uuid');

      // Assert
      expect(result).toMatchObject({ message: expect.stringContaining('ordem-uuid') });
    });

    it('deve propagar NotFoundException quando OS não existe', async () => {
      // Arrange
      serviceMock.remove.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.remove('inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
