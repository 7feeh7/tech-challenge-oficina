import {
  EstoqueInsuficienteError,
  ObservacaoMovimentacaoInvalidaError,
  PecaDaMovimentacaoObrigatoriaError,
  QuantidadeMovimentacaoInvalidaError,
} from '../errors/movimentacao-estoque.errors';
import { TipoMovimentacaoEstoque } from '../tipo-movimentacao-estoque';

export interface MovimentacaoEstoqueProps {
  id?: string;
  pecaId: string;
  tipo: TipoMovimentacaoEstoque;
  quantidade: number;
  ordemServicoId?: string | null;
  observacao?: string | null;
  criadoEm?: Date;
}

const OBSERVACAO_MAX = 500;

/**
 * Registro imutável de entrada ou baixa de estoque. A movimentação é o que
 * move o saldo da peça, por isso é ela quem sabe calcular o saldo resultante —
 * e quem recusa uma baixa maior que o disponível.
 */
export class MovimentacaoEstoque {
  readonly id?: string;
  readonly pecaId: string;
  readonly tipo: TipoMovimentacaoEstoque;
  readonly quantidade: number;
  readonly ordemServicoId: string | null;
  readonly observacao: string | null;
  readonly criadoEm: Date;

  constructor(props: MovimentacaoEstoqueProps) {
    this.id = props.id;
    this.pecaId = MovimentacaoEstoque.validarPecaId(props.pecaId);
    this.tipo = props.tipo;
    this.quantidade = MovimentacaoEstoque.validarQuantidade(props.quantidade);
    this.ordemServicoId = props.ordemServicoId ?? null;
    this.observacao = MovimentacaoEstoque.normalizarObservacao(
      props.observacao,
    );
    this.criadoEm = props.criadoEm ?? new Date();
  }

  ehEntrada(): boolean {
    return this.tipo === TipoMovimentacaoEstoque.ENTRADA;
  }

  /**
   * Saldo da peça depois de aplicar esta movimentação.
   * Recusa a baixa que deixaria o estoque negativo.
   */
  saldoApos(saldoAtual: number): number {
    if (this.ehEntrada()) {
      return saldoAtual + this.quantidade;
    }

    if (this.quantidade > saldoAtual) {
      throw new EstoqueInsuficienteError(saldoAtual, this.quantidade);
    }

    return saldoAtual - this.quantidade;
  }

  private static validarPecaId(pecaId: string): string {
    const normalizado = pecaId?.trim();
    if (!normalizado) {
      throw new PecaDaMovimentacaoObrigatoriaError();
    }
    return normalizado;
  }

  private static validarQuantidade(quantidade: number): number {
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      throw new QuantidadeMovimentacaoInvalidaError();
    }
    return quantidade;
  }

  private static normalizarObservacao(
    observacao?: string | null,
  ): string | null {
    const normalizada = observacao?.trim();
    if (!normalizada) return null;
    if (normalizada.length > OBSERVACAO_MAX) {
      throw new ObservacaoMovimentacaoInvalidaError();
    }
    return normalizada;
  }
}
