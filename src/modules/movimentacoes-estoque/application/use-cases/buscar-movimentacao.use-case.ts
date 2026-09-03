import { MovimentacaoEstoqueNaoEncontradaError } from '../../domain/errors/movimentacao-estoque.errors';
import {
  MovimentacaoEstoqueOutput,
  MovimentacaoEstoqueOutputMapper,
} from '../mappers/movimentacao-estoque-output.mapper';
import { MovimentacaoEstoqueGateway } from '../ports/movimentacao-estoque.gateway';

export class BuscarMovimentacaoUseCase {
  constructor(private readonly movimentacoes: MovimentacaoEstoqueGateway) {}

  async execute(id: string): Promise<MovimentacaoEstoqueOutput> {
    const movimentacao = await this.movimentacoes.buscarComPecaPorId(id);
    if (!movimentacao) {
      throw new MovimentacaoEstoqueNaoEncontradaError(id);
    }

    return MovimentacaoEstoqueOutputMapper.toOutput(movimentacao);
  }
}
