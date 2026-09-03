import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

export class NomeServicoInvalidoError extends DomainValidationError {
  constructor() {
    super('O nome do serviço deve possuir entre 3 e 100 caracteres.');
  }
}

export class DescricaoServicoInvalidaError extends DomainValidationError {
  constructor() {
    super('A descrição do serviço deve possuir no máximo 500 caracteres.');
  }
}

export class PrecoServicoInvalidoError extends DomainValidationError {
  constructor() {
    super('O preço base do serviço deve ser um valor positivo.');
  }
}

export class TempoEstimadoServicoInvalidoError extends DomainValidationError {
  constructor() {
    super(
      'O tempo estimado do serviço deve ser um número inteiro de minutos maior que zero.',
    );
  }
}

export class ServicoNaoEncontradoError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Serviço com id "${id}" não encontrado.`);
  }
}

export class NomeServicoJaExisteError extends DomainConflictError {
  constructor(message = 'Já existe um serviço com esse nome.') {
    super(message);
  }
}
