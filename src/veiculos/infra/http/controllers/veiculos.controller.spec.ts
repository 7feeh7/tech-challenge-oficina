import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarVeiculoUseCase } from '@/veiculos/application/use-cases/atualizar-veiculo.use-case';
import { BuscarVeiculoUseCase } from '@/veiculos/application/use-cases/buscar-veiculo.use-case';
import { CriarVeiculoUseCase } from '@/veiculos/application/use-cases/criar-veiculo.use-case';
import { ListarVeiculosUseCase } from '@/veiculos/application/use-cases/listar-veiculos.use-case';
import { RemoverVeiculoUseCase } from '@/veiculos/application/use-cases/remover-veiculo.use-case';
import {
  ClienteDoVeiculoNaoEncontradoError,
  PlacaVeiculoJaExisteError,
  VeiculoNaoEncontradoError,
} from '@/veiculos/domain/errors/veiculo.errors';
import { VeiculosController } from './veiculos.controller';

const veiculoMock = {
  id: 'uuid-v1',
  placa: 'ABC1D23',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2023,
  clienteId: 'uuid-c1',
};

const criarVeiculoMock = { execute: jest.fn() };
const listarVeiculosMock = { execute: jest.fn() };
const buscarVeiculoMock = { execute: jest.fn() };
const atualizarVeiculoMock = { execute: jest.fn() };
const removerVeiculoMock = { execute: jest.fn() };

describe('VeiculosController', () => {
  let controller: VeiculosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VeiculosController],
      providers: [
        { provide: CriarVeiculoUseCase, useValue: criarVeiculoMock },
        { provide: ListarVeiculosUseCase, useValue: listarVeiculosMock },
        { provide: BuscarVeiculoUseCase, useValue: buscarVeiculoMock },
        { provide: AtualizarVeiculoUseCase, useValue: atualizarVeiculoMock },
        { provide: RemoverVeiculoUseCase, useValue: removerVeiculoMock },
      ],
    }).compile();

    controller = module.get<VeiculosController>(VeiculosController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      placa: 'ABC1D23',
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2023,
      clienteId: 'uuid-c1',
    };

    it('deve delegar ao caso de uso e retornar os dados', async () => {
      // Arrange
      criarVeiculoMock.execute.mockResolvedValue(veiculoMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(criarVeiculoMock.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual(veiculoMock);
    });

    it('deve propagar o erro de domínio quando a placa já existe', async () => {
      // Arrange
      criarVeiculoMock.execute.mockRejectedValue(
        new PlacaVeiculoJaExisteError(),
      );

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        PlacaVeiculoJaExisteError,
      );
    });

    it('deve propagar o erro de domínio quando o cliente não existe', async () => {
      // Arrange
      criarVeiculoMock.execute.mockRejectedValue(
        new ClienteDoVeiculoNaoEncontradoError('uuid-c1'),
      );

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        ClienteDoVeiculoNaoEncontradoError,
      );
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [veiculoMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarVeiculosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarVeiculosMock.execute).toHaveBeenCalledWith(1, 10, undefined);
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar parâmetros de busca e paginação ao caso de uso', async () => {
      // Arrange
      listarVeiculosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'Corolla');

      // Assert
      expect(listarVeiculosMock.execute).toHaveBeenCalledWith(2, 5, 'Corolla');
    });
  });

  describe('findOne', () => {
    it('deve retornar um veículo pelo id', async () => {
      // Arrange
      buscarVeiculoMock.execute.mockResolvedValue({
        ...veiculoMock,
        cliente: { id: 'uuid-c1', nome: 'João Silva' },
      });

      // Act
      const result = await controller.findOne('uuid-v1');

      // Assert
      expect(buscarVeiculoMock.execute).toHaveBeenCalledWith('uuid-v1');
      expect(result).toMatchObject({ id: 'uuid-v1' });
    });

    it('deve propagar o erro de domínio quando o veículo não existe', async () => {
      // Arrange
      buscarVeiculoMock.execute.mockRejectedValue(
        new VeiculoNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        VeiculoNaoEncontradoError,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o veículo atualizado', async () => {
      // Arrange
      const updated = { ...veiculoMock, modelo: 'Hilux' };
      atualizarVeiculoMock.execute.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-v1', { modelo: 'Hilux' });

      // Assert
      expect(atualizarVeiculoMock.execute).toHaveBeenCalledWith('uuid-v1', {
        modelo: 'Hilux',
      });
      expect(result).toMatchObject({ modelo: 'Hilux' });
    });

    it('deve propagar o erro de domínio quando o veículo não existe', async () => {
      // Arrange
      atualizarVeiculoMock.execute.mockRejectedValue(
        new VeiculoNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-inexistente', { modelo: 'Hilux' }),
      ).rejects.toThrow(VeiculoNaoEncontradoError);
    });

    it('deve propagar o erro de domínio quando a placa já está em uso', async () => {
      // Arrange
      atualizarVeiculoMock.execute.mockRejectedValue(
        new PlacaVeiculoJaExisteError(),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-v1', { placa: 'XYZ9K88' }),
      ).rejects.toThrow(PlacaVeiculoJaExisteError);
    });
  });

  describe('remove', () => {
    it('deve remover um veículo e retornar mensagem de sucesso', async () => {
      // Arrange
      removerVeiculoMock.execute.mockResolvedValue({
        message: 'Veículo "uuid-v1" removido com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-v1');

      // Assert
      expect(removerVeiculoMock.execute).toHaveBeenCalledWith('uuid-v1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-v1'),
      });
    });

    it('deve propagar o erro de domínio quando o veículo não existe', async () => {
      // Arrange
      removerVeiculoMock.execute.mockRejectedValue(
        new VeiculoNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(
        VeiculoNaoEncontradoError,
      );
    });
  });
});
