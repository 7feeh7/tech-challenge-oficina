import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
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

export interface SaldosPecaMovimentacao {
  quantidadeFisica: number;
  quantidadeReservada: number;
  quantidadeDisponivel: number;
}

export interface MovimentacaoEstoqueGateway {
  buscarSaldosDaPeca(pecaId: string): Promise<SaldosPecaMovimentacao | null>;
  buscarComPecaPorId(id: string): Promise<MovimentacaoComPeca | null>;
  listar(
    page: number,
    limit: number,
    pecaId?: string,
  ): Promise<PaginaMovimentacoes>;
  /**
   * Bloqueia a peça, aplica entrada/baixa com UPDATE relativo e grava o histórico
   * na mesma transação do Unit of Work (D2.20, D3.16).
   */
  registrar(
    contexto: ContextoTransacao,
    movimentacao: MovimentacaoEstoque,
  ): Promise<MovimentacaoComPeca>;
}
