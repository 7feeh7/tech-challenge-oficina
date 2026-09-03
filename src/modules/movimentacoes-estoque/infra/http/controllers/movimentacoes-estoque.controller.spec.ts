import { Test, TestingModule } from '@nestjs/testing';
import { BuscarMovimentacaoUseCase } from '@/modules/movimentacoes-estoque/application/use-cases/buscar-movimentacao.use-case';
import { ListarMovimentacoesUseCase } from '@/modules/movimentacoes-estoque/application/use-cases/listar-movimentacoes.use-case';
import { RegistrarMovimentacaoUseCase } from '@/modules/movimentacoes-estoque/application/use-cases/registrar-movimentacao.use-case';
import {
  EstoqueInsuficienteError,
  MovimentacaoEstoqueNaoEncontradaError,
  PecaDaMovimentacaoNaoEncontradaError,
} from '@/modules/movimentacoes-estoque/domain/errors/movimentacao-estoque.errors';
import { TipoMovimentacaoEstoque } from '@/modules/movimentacoes-estoque/domain/tipo-movimentacao-estoque';
import { MovimentacoesEstoqueController } from './movimentacoes-estoque.controller';

const movimentacaoMock = {
  id: 'uuid-m1',
  pecaId: 'uuid-p1',
  peca: { id: 'uuid-p1', codigo: 'FLT-001', nome: 'Filtro de óleo' },
  tipo: TipoMovimentacaoEstoque.ENTRADA,
  quantidade: 5,
  ordemServicoId: null,
  observacao: null,
  criadoEm: new Date(),
};

const registrarMovimentacaoMock = { execute: jest.fn() };
const listarMovimentacoesMock = { execute: jest.fn() };
const buscarMovimentacaoMock = { execute: jest.fn() };

describe('MovimentacoesEstoqueController', () => {
  let controller: MovimentacoesEstoqueController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MovimentacoesEstoqueController],
      providers: [
        {
          provide: RegistrarMovimentacaoUseCase,
          useValue: registrarMovimentacaoMock,
        },
        {
          provide: ListarMovimentacoesUseCase,
          useValue: listarMovimentacoesMock,
        },
        {
          provide: BuscarMovimentacaoUseCase,
          useValue: buscarMovimentacaoMock,
        },
      ],
    }).compile();

    controller = module.get<MovimentacoesEstoqueController>(
      MovimentacoesEstoqueController,
    );
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      pecaId: 'uuid-p1',
      tipo: TipoMovimentacaoEstoque.ENTRADA,
      quantidade: 5,
    };

    it('deve delegar ao caso de uso e retornar a movimentação', async () => {
      // Arrange
      registrarMovimentacaoMock.execute.mockResolvedValue(movimentacaoMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(registrarMovimentacaoMock.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual(movimentacaoMock);
    });

    it('deve propagar o erro de domínio quando o estoque é insuficiente', async () => {
      // Arrange
      registrarMovimentacaoMock.execute.mockRejectedValue(
        new EstoqueInsuficienteError(3, 5),
      );

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        EstoqueInsuficienteError,
      );
    });

    it('deve propagar o erro de domínio quando a peça não existe', async () => {
      // Arrange
      registrarMovimentacaoMock.execute.mockRejectedValue(
        new PecaDaMovimentacaoNaoEncontradaError('uuid-p1'),
      );

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        PecaDaMovimentacaoNaoEncontradaError,
      );
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [movimentacaoMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarMovimentacoesMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarMovimentacoesMock.execute).toHaveBeenCalledWith(
        1,
        10,
        undefined,
      );
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar o filtro por peça ao caso de uso', async () => {
      // Arrange
      listarMovimentacoesMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'uuid-p1');

      // Assert
      expect(listarMovimentacoesMock.execute).toHaveBeenCalledWith(
        2,
        5,
        'uuid-p1',
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar uma movimentação pelo id', async () => {
      // Arrange
      buscarMovimentacaoMock.execute.mockResolvedValue(movimentacaoMock);

      // Act
      const result = await controller.findOne('uuid-m1');

      // Assert
      expect(buscarMovimentacaoMock.execute).toHaveBeenCalledWith('uuid-m1');
      expect(result).toMatchObject({ id: 'uuid-m1' });
    });

    it('deve propagar o erro de domínio quando a movimentação não existe', async () => {
      // Arrange
      buscarMovimentacaoMock.execute.mockRejectedValue(
        new MovimentacaoEstoqueNaoEncontradaError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        MovimentacaoEstoqueNaoEncontradaError,
      );
    });
  });
});
