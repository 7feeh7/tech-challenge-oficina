import {
  MovimentacaoEstoqueOutput,
  MovimentacaoEstoqueOutputMapper,
} from '../mappers/movimentacao-estoque-output.mapper';
import { MovimentacaoEstoqueGateway } from '../ports/movimentacao-estoque.gateway';

export interface ListaMovimentacoesOutput {
  data: MovimentacaoEstoqueOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarMovimentacoesUseCase {
  constructor(private readonly movimentacoes: MovimentacaoEstoqueGateway) {}

  async execute(
    page = 1,
    limit = 10,
    pecaId?: string,
  ): Promise<ListaMovimentacoesOutput> {
    const resultado = await this.movimentacoes.listar(page, limit, pecaId);

    return {
      data: resultado.movimentacoes.map(
        MovimentacaoEstoqueOutputMapper.toOutput,
      ),
      meta: {
        total: resultado.total,
        page,
        limit,
        totalPages: Math.ceil(resultado.total / limit),
      },
    };
  }
}
