import {
  MovimentacaoEstoque,
  MovimentacaoEstoqueProps,
} from '../../domain/entities/movimentacao-estoque.entity';
import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';
import {
  MovimentacaoComPeca,
  MovimentacaoEstoqueGateway,
} from '../ports/movimentacao-estoque.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const pecaFake = {
  id: 'uuid-p1',
  codigo: 'FLT-001',
  nome: 'Filtro de óleo',
};

export const criarMovimentacaoFake = (
  overrides: Partial<MovimentacaoEstoqueProps> = {},
): MovimentacaoEstoque =>
  new MovimentacaoEstoque({
    id: 'uuid-m1',
    pecaId: 'uuid-p1',
    tipo: TipoMovimentacaoEstoque.ENTRADA,
    quantidade: 5,
    criadoEm: new Date(),
    ...overrides,
  });

export const criarMovimentacaoComPecaFake = (
  overrides: Partial<MovimentacaoEstoqueProps> = {},
): MovimentacaoComPeca => ({
  movimentacao: criarMovimentacaoFake(overrides),
  peca: pecaFake,
});

export const criarGatewayMock =
  (): jest.Mocked<MovimentacaoEstoqueGateway> => ({
    buscarSaldoDaPeca: jest.fn(),
    buscarComPecaPorId: jest.fn(),
    listar: jest.fn(),
    registrar: jest.fn(),
  });
