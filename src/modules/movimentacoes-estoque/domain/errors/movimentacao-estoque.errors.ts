import {
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

export class QuantidadeMovimentacaoInvalidaError extends DomainValidationError {
  constructor() {
    super('A quantidade movimentada deve ser um inteiro maior que zero.');
  }
}

export class PecaDaMovimentacaoObrigatoriaError extends DomainValidationError {
  constructor() {
    super('A movimentação deve referenciar uma peça.');
  }
}

export class ObservacaoMovimentacaoInvalidaError extends DomainValidationError {
  constructor() {
    super('A observação deve possuir no máximo 500 caracteres.');
  }
}

/** Baixa maior que o saldo disponível: é o que impede o estoque de ficar negativo. */
export class EstoqueInsuficienteError extends DomainValidationError {
  constructor(disponivel: number, solicitado: number) {
    super(
      `Estoque insuficiente. Disponível: ${disponivel}, solicitado: ${solicitado}.`,
    );
  }
}

export class PecaDaMovimentacaoNaoEncontradaError extends DomainNotFoundError {
  constructor(pecaId: string) {
    super(`Peça "${pecaId}" não encontrada.`);
  }
}

export class MovimentacaoEstoqueNaoEncontradaError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Movimentação de estoque "${id}" não encontrada.`);
  }
}
