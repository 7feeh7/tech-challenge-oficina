import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/atualizar-orcamento.use-case';
import { BuscarOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/buscar-orcamento.use-case';
import { CriarOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/criar-orcamento.use-case';
import { ListarOrcamentosUseCase } from '@/modules/orcamentos/application/use-cases/listar-orcamentos.use-case';
import { RemoverOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/remover-orcamento.use-case';
import {
  EstoqueInsuficienteParaAprovacaoError,
  MotivoRejeicaoObrigatorioError,
  OrcamentoNaoEncontradoError,
} from '@/modules/orcamentos/domain/errors/orcamento.errors';
import { StatusOrcamento } from '@/modules/orcamentos/domain/status-orcamento';
import { OrcamentosController } from './orcamentos.controller';

const orcamentoMock = {
  id: 'uuid-orc1',
  ordemServicoId: 'uuid-os1',
  valorTotal: 350,
  status: StatusOrcamento.AGUARDANDO_APROVACAO,
};

const criarOrcamentoMock = { execute: jest.fn() };
const listarOrcamentosMock = { execute: jest.fn() };
const buscarOrcamentoMock = { execute: jest.fn() };
const atualizarOrcamentoMock = { execute: jest.fn() };
const removerOrcamentoMock = { execute: jest.fn() };

describe('OrcamentosController', () => {
  let controller: OrcamentosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrcamentosController],
      providers: [
        { provide: CriarOrcamentoUseCase, useValue: criarOrcamentoMock },
        { provide: ListarOrcamentosUseCase, useValue: listarOrcamentosMock },
        { provide: BuscarOrcamentoUseCase, useValue: buscarOrcamentoMock },
        {
          provide: AtualizarOrcamentoUseCase,
          useValue: atualizarOrcamentoMock,
        },
        { provide: RemoverOrcamentoUseCase, useValue: removerOrcamentoMock },
      ],
    }).compile();

    controller = module.get<OrcamentosController>(OrcamentosController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = { ordemServicoId: 'uuid-os1', valorTotal: 350 };

    it('deve delegar ao caso de uso e retornar o orçamento', async () => {
      // Arrange
      criarOrcamentoMock.execute.mockResolvedValue(orcamentoMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(criarOrcamentoMock.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual(orcamentoMock);
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [orcamentoMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarOrcamentosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarOrcamentosMock.execute).toHaveBeenCalledWith(
        1,
        10,
        undefined,
      );
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar o filtro por OS ao caso de uso', async () => {
      // Arrange
      listarOrcamentosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'uuid-os1');

      // Assert
      expect(listarOrcamentosMock.execute).toHaveBeenCalledWith(
        2,
        5,
        'uuid-os1',
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar um orçamento pelo id', async () => {
      // Arrange
      buscarOrcamentoMock.execute.mockResolvedValue(orcamentoMock);

      // Act
      const result = await controller.findOne('uuid-orc1');

      // Assert
      expect(buscarOrcamentoMock.execute).toHaveBeenCalledWith('uuid-orc1');
      expect(result).toMatchObject({ id: 'uuid-orc1' });
    });

    it('deve propagar o erro de domínio quando o orçamento não existe', async () => {
      // Arrange
      buscarOrcamentoMock.execute.mockRejectedValue(
        new OrcamentoNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        OrcamentoNaoEncontradoError,
      );
    });
  });

  describe('update', () => {
    it('deve aprovar o orçamento', async () => {
      // Arrange
      const aprovado = { ...orcamentoMock, status: StatusOrcamento.APROVADO };
      atualizarOrcamentoMock.execute.mockResolvedValue(aprovado);

      // Act
      const result = await controller.update(
        'uuid-orc1',
        { status: StatusOrcamento.APROVADO },
        {},
      );

      // Assert
      expect(atualizarOrcamentoMock.execute).toHaveBeenCalledWith('uuid-orc1', {
        status: StatusOrcamento.APROVADO,
      });
      expect(result).toMatchObject({ status: StatusOrcamento.APROVADO });
    });

    it('deve propagar o erro de domínio quando falta estoque para aprovar', async () => {
      // Arrange
      atualizarOrcamentoMock.execute.mockRejectedValue(
        new EstoqueInsuficienteParaAprovacaoError('uuid-p1', 3, 5),
      );

      // Act & Assert
      await expect(
        controller.update(
          'uuid-orc1',
          { status: StatusOrcamento.APROVADO },
          {},
        ),
      ).rejects.toThrow(EstoqueInsuficienteParaAprovacaoError);
    });

    it('deve propagar o erro de domínio ao rejeitar sem motivo', async () => {
      // Arrange
      atualizarOrcamentoMock.execute.mockRejectedValue(
        new MotivoRejeicaoObrigatorioError(),
      );

      // Act & Assert
      await expect(
        controller.update(
          'uuid-orc1',
          { status: StatusOrcamento.REJEITADO },
          {},
        ),
      ).rejects.toThrow(MotivoRejeicaoObrigatorioError);
    });
  });

  describe('remove', () => {
    it('deve remover um orçamento e retornar mensagem de sucesso', async () => {
      // Arrange
      removerOrcamentoMock.execute.mockResolvedValue({
        message: 'Orçamento "uuid-orc1" removido com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-orc1');

      // Assert
      expect(removerOrcamentoMock.execute).toHaveBeenCalledWith('uuid-orc1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-orc1'),
      });
    });
  });
});
