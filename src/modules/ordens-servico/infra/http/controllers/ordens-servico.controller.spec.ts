import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/atualizar-ordem-servico.use-case';
import { BuscarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/buscar-ordem-servico.use-case';
import { CalcularTempoMedioUseCase } from '@/modules/ordens-servico/application/use-cases/calcular-tempo-medio.use-case';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { ListarOrdensServicoUseCase } from '@/modules/ordens-servico/application/use-cases/listar-ordens-servico.use-case';
import { RemoverOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/remover-ordem-servico.use-case';
import {
  OrdemServicoNaoEncontradaError,
  TransicaoStatusInvalidaError,
} from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { OrdensServicoController } from './ordens-servico.controller';

const ordemMock = {
  id: 'uuid-os1',
  numero: 1,
  status: StatusOS.RECEBIDA,
  cliente: { id: 'uuid-c1', nome: 'João Silva' },
  veiculo: { id: 'uuid-v1', placa: 'ABC1D23', modelo: 'Corolla' },
};

const criarOrdemMock = { execute: jest.fn() };
const listarOrdensMock = { execute: jest.fn() };
const buscarOrdemMock = { execute: jest.fn() };
const atualizarOrdemMock = { execute: jest.fn() };
const removerOrdemMock = { execute: jest.fn() };
const calcularTempoMedioMock = { execute: jest.fn() };

describe('OrdensServicoController', () => {
  let controller: OrdensServicoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdensServicoController],
      providers: [
        { provide: CriarOrdemServicoUseCase, useValue: criarOrdemMock },
        { provide: ListarOrdensServicoUseCase, useValue: listarOrdensMock },
        { provide: BuscarOrdemServicoUseCase, useValue: buscarOrdemMock },
        { provide: AtualizarOrdemServicoUseCase, useValue: atualizarOrdemMock },
        { provide: RemoverOrdemServicoUseCase, useValue: removerOrdemMock },
        {
          provide: CalcularTempoMedioUseCase,
          useValue: calcularTempoMedioMock,
        },
      ],
    }).compile();

    controller = module.get<OrdensServicoController>(OrdensServicoController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = { clienteId: 'uuid-c1', veiculoId: 'uuid-v1' };

    it('deve delegar ao caso de uso e retornar a OS', async () => {
      // Arrange
      criarOrdemMock.execute.mockResolvedValue(ordemMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(criarOrdemMock.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual(ordemMock);
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [ordemMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarOrdensMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarOrdensMock.execute).toHaveBeenCalledWith(1, 10, undefined);
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar o filtro por status ao caso de uso', async () => {
      // Arrange
      listarOrdensMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, StatusOS.EM_EXECUCAO);

      // Assert
      expect(listarOrdensMock.execute).toHaveBeenCalledWith(
        2,
        5,
        StatusOS.EM_EXECUCAO,
      );
    });
  });

  describe('metricas', () => {
    it('deve converter as datas do query string antes de delegar', async () => {
      // Arrange
      calcularTempoMedioMock.execute.mockResolvedValue({ totalOrdens: 0 });

      // Act
      await controller.metricas('2026-01-01', '2026-01-31');

      // Assert
      expect(calcularTempoMedioMock.execute).toHaveBeenCalledWith(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );
    });

    it('deve delegar sem filtros quando as datas não são informadas', async () => {
      // Arrange
      calcularTempoMedioMock.execute.mockResolvedValue({ totalOrdens: 0 });

      // Act
      await controller.metricas(undefined, undefined);

      // Assert
      expect(calcularTempoMedioMock.execute).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar uma OS pelo id', async () => {
      // Arrange
      buscarOrdemMock.execute.mockResolvedValue(ordemMock);

      // Act
      const result = await controller.findOne('uuid-os1');

      // Assert
      expect(buscarOrdemMock.execute).toHaveBeenCalledWith('uuid-os1');
      expect(result).toMatchObject({ id: 'uuid-os1' });
    });

    it('deve propagar o erro de domínio quando a OS não existe', async () => {
      // Arrange
      buscarOrdemMock.execute.mockRejectedValue(
        new OrdemServicoNaoEncontradaError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        OrdemServicoNaoEncontradaError,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar o status da OS', async () => {
      // Arrange
      const updated = { ...ordemMock, status: StatusOS.EM_DIAGNOSTICO };
      atualizarOrdemMock.execute.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-os1', {
        status: StatusOS.EM_DIAGNOSTICO,
      });

      // Assert
      expect(atualizarOrdemMock.execute).toHaveBeenCalledWith('uuid-os1', {
        status: StatusOS.EM_DIAGNOSTICO,
      });
      expect(result).toMatchObject({ status: StatusOS.EM_DIAGNOSTICO });
    });

    it('deve propagar o erro de domínio numa transição inválida', async () => {
      // Arrange
      atualizarOrdemMock.execute.mockRejectedValue(
        new TransicaoStatusInvalidaError(StatusOS.RECEBIDA, StatusOS.ENTREGUE),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-os1', { status: StatusOS.ENTREGUE }),
      ).rejects.toThrow(TransicaoStatusInvalidaError);
    });
  });

  describe('remove', () => {
    it('deve remover uma OS e retornar mensagem de sucesso', async () => {
      // Arrange
      removerOrdemMock.execute.mockResolvedValue({
        message: 'Ordem de serviço "uuid-os1" removida com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-os1');

      // Assert
      expect(removerOrdemMock.execute).toHaveBeenCalledWith('uuid-os1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-os1'),
      });
    });
  });
});
