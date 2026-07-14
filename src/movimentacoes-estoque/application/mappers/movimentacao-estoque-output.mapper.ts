import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';
import {
  MovimentacaoComPeca,
  PecaDaMovimentacao,
} from '../ports/movimentacao-estoque.gateway';

export interface MovimentacaoEstoqueOutput {
  id?: string;
  pecaId: string;
  peca: PecaDaMovimentacao;
  tipo: TipoMovimentacaoEstoque;
  quantidade: number;
  ordemServicoId: string | null;
  observacao: string | null;
  criadoEm: Date;
}

export class MovimentacaoEstoqueOutputMapper {
  static toOutput(
    this: void,
    { movimentacao, peca }: MovimentacaoComPeca,
  ): MovimentacaoEstoqueOutput {
    return {
      id: movimentacao.id,
      pecaId: movimentacao.pecaId,
      peca,
      tipo: movimentacao.tipo,
      quantidade: movimentacao.quantidade,
      ordemServicoId: movimentacao.ordemServicoId,
      observacao: movimentacao.observacao,
      criadoEm: movimentacao.criadoEm,
    };
  }
}
