import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';

/** Peça na visão da movimentação: só o necessário para identificá-la. */
export interface PecaDaMovimentacao {
  id: string;
  codigo: string;
  nome: string;
}

export interface MovimentacaoComPeca {
  movimentacao: MovimentacaoEstoque;
  peca: PecaDaMovimentacao;
}

export interface PaginaMovimentacoes {
  movimentacoes: MovimentacaoComPeca[];
  total: number;
}

export interface MovimentacaoEstoqueGateway {
  buscarSaldoDaPeca(pecaId: string): Promise<number | null>;
  buscarComPecaPorId(id: string): Promise<MovimentacaoComPeca | null>;
  listar(
    page: number,
    limit: number,
    pecaId?: string,
  ): Promise<PaginaMovimentacoes>;
  /**
   * Grava a movimentação e ajusta o saldo da peça na MESMA transação — as duas
   * escritas precisam acontecer juntas, ou o histórico e o saldo divergem.
   */
  registrar(
    movimentacao: MovimentacaoEstoque,
    novoSaldo: number,
  ): Promise<MovimentacaoComPeca>;
}
