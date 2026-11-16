import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';
import { PecaDaMovimentacaoNaoEncontradaError } from '../../domain/errors/movimentacao-estoque.errors';
import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';
import {
  MovimentacaoEstoqueOutput,
  MovimentacaoEstoqueOutputMapper,
} from '../mappers/movimentacao-estoque-output.mapper';
import { MovimentacaoEstoqueGateway } from '../ports/movimentacao-estoque.gateway';

export interface RegistrarMovimentacaoInput {
  pecaId: string;
  tipo: TipoMovimentacaoEstoque;
  quantidade: number;
  ordemServicoId?: string;
  observacao?: string;
}

export class RegistrarMovimentacaoUseCase {
  constructor(private readonly movimentacoes: MovimentacaoEstoqueGateway) {}

  async execute(
    input: RegistrarMovimentacaoInput,
  ): Promise<MovimentacaoEstoqueOutput> {
    const movimentacao = new MovimentacaoEstoque(input);

    const saldos = await this.movimentacoes.buscarSaldosDaPeca(
      movimentacao.pecaId,
    );
    if (saldos === null) {
      throw new PecaDaMovimentacaoNaoEncontradaError(movimentacao.pecaId);
    }

    const novoSaldo = movimentacao.saldoFisicoApos(
      saldos.quantidadeFisica,
      saldos.quantidadeDisponivel,
    );

    return MovimentacaoEstoqueOutputMapper.toOutput(
      await this.movimentacoes.registrar(movimentacao, novoSaldo),
    );
  }
}
