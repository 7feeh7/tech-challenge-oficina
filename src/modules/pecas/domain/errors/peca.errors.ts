import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

export class CodigoPecaInvalidoError extends DomainValidationError {
  constructor() {
    super('O código da peça deve possuir entre 2 e 30 caracteres.');
  }
}

export class NomePecaInvalidoError extends DomainValidationError {
  constructor() {
    super('O nome da peça deve possuir entre 3 e 100 caracteres.');
  }
}

export class DescricaoPecaInvalidaError extends DomainValidationError {
  constructor() {
    super('A descrição da peça deve possuir no máximo 500 caracteres.');
  }
}

export class PrecoPecaInvalidoError extends DomainValidationError {
  constructor() {
    super('O preço unitário da peça deve ser um valor positivo.');
  }
}

export class QuantidadeEstoqueInvalidaError extends DomainValidationError {
  constructor() {
    super('A quantidade em estoque deve ser um inteiro maior ou igual a zero.');
  }
}

export class EstoqueMinimoInvalidoError extends DomainValidationError {
  constructor() {
    super('O estoque mínimo deve ser um inteiro maior ou igual a zero.');
  }
}

export class PecaNaoEncontradaError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Peça com id "${id}" não encontrada.`);
  }
}

export class CodigoPecaJaExisteError extends DomainConflictError {
  constructor(message = 'Já existe uma peça com esse código.') {
    super(message);
  }
}
