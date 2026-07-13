import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarPecaUseCase } from '@/pecas/application/use-cases/atualizar-peca.use-case';
import { BuscarPecaUseCase } from '@/pecas/application/use-cases/buscar-peca.use-case';
import { CriarPecaUseCase } from '@/pecas/application/use-cases/criar-peca.use-case';
import { ListarPecasUseCase } from '@/pecas/application/use-cases/listar-pecas.use-case';
import { RemoverPecaUseCase } from '@/pecas/application/use-cases/remover-peca.use-case';
import {
  CodigoPecaJaExisteError,
  PecaNaoEncontradaError,
} from '@/pecas/domain/errors/peca.errors';
import { PecasController } from './pecas.controller';

const pecaMock = {
  id: 'uuid-p1',
  codigo: 'FLT-001',
  nome: 'Filtro de óleo',
  descricao: 'Filtro de óleo para motores 1.0 a 2.0',
  precoUnitario: 29.9,
  quantidadeEstoque: 10,
  estoqueMinimo: 2,
  ativo: true,
};

const criarPecaMock = { execute: jest.fn() };
const listarPecasMock = { execute: jest.fn() };
const buscarPecaMock = { execute: jest.fn() };
const atualizarPecaMock = { execute: jest.fn() };
const removerPecaMock = { execute: jest.fn() };

describe('PecasController', () => {
  let controller: PecasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PecasController],
      providers: [
        { provide: CriarPecaUseCase, useValue: criarPecaMock },
        { provide: ListarPecasUseCase, useValue: listarPecasMock },
        { provide: BuscarPecaUseCase, useValue: buscarPecaMock },
        { provide: AtualizarPecaUseCase, useValue: atualizarPecaMock },
        { provide: RemoverPecaUseCase, useValue: removerPecaMock },
      ],
    }).compile();

    controller = module.get<PecasController>(PecasController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      codigo: 'FLT-001',
      nome: 'Filtro de óleo',
      precoUnitario: 29.9,
    };

    it('deve delegar ao caso de uso e retornar os dados', async () => {
      // Arrange
      criarPecaMock.execute.mockResolvedValue(pecaMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(criarPecaMock.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual(pecaMock);
    });

    it('deve propagar o erro de domínio quando o código já existe', async () => {
      // Arrange
      criarPecaMock.execute.mockRejectedValue(new CodigoPecaJaExisteError());

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        CodigoPecaJaExisteError,
      );
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [pecaMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarPecasMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarPecasMock.execute).toHaveBeenCalledWith(1, 10, undefined);
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar parâmetros de busca e paginação ao caso de uso', async () => {
      // Arrange
      listarPecasMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'filtro');

      // Assert
      expect(listarPecasMock.execute).toHaveBeenCalledWith(2, 5, 'filtro');
    });
  });

  describe('findOne', () => {
    it('deve retornar uma peça pelo id', async () => {
      // Arrange
      buscarPecaMock.execute.mockResolvedValue(pecaMock);

      // Act
      const result = await controller.findOne('uuid-p1');

      // Assert
      expect(buscarPecaMock.execute).toHaveBeenCalledWith('uuid-p1');
      expect(result).toMatchObject({ id: 'uuid-p1' });
    });

    it('deve propagar o erro de domínio quando a peça não existe', async () => {
      // Arrange
      buscarPecaMock.execute.mockRejectedValue(
        new PecaNaoEncontradaError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        PecaNaoEncontradaError,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar a peça atualizada', async () => {
      // Arrange
      const updated = { ...pecaMock, precoUnitario: 45.5 };
      atualizarPecaMock.execute.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-p1', {
        precoUnitario: 45.5,
      });

      // Assert
      expect(atualizarPecaMock.execute).toHaveBeenCalledWith('uuid-p1', {
        precoUnitario: 45.5,
      });
      expect(result).toMatchObject({ precoUnitario: 45.5 });
    });

    it('deve propagar o erro de domínio quando a peça não existe', async () => {
      // Arrange
      atualizarPecaMock.execute.mockRejectedValue(
        new PecaNaoEncontradaError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-inexistente', { precoUnitario: 10 }),
      ).rejects.toThrow(PecaNaoEncontradaError);
    });

    it('deve propagar o erro de domínio quando o código já está em uso', async () => {
      // Arrange
      atualizarPecaMock.execute.mockRejectedValue(
        new CodigoPecaJaExisteError(),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-p1', { codigo: 'FLT-999' }),
      ).rejects.toThrow(CodigoPecaJaExisteError);
    });
  });

  describe('remove', () => {
    it('deve remover uma peça e retornar mensagem de sucesso', async () => {
      // Arrange
      removerPecaMock.execute.mockResolvedValue({
        message: 'Peça "uuid-p1" removida com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-p1');

      // Assert
      expect(removerPecaMock.execute).toHaveBeenCalledWith('uuid-p1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-p1'),
      });
    });

    it('deve propagar o erro de domínio quando a peça não existe', async () => {
      // Arrange
      removerPecaMock.execute.mockRejectedValue(
        new PecaNaoEncontradaError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(
        PecaNaoEncontradaError,
      );
    });
  });
});
