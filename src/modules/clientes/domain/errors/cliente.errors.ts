import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

export class NomeClienteInvalidoError extends DomainValidationError {
  constructor() {
    super('O nome do cliente deve possuir entre 3 e 100 caracteres.');
  }
}

export class EmailClienteInvalidoError extends DomainValidationError {
  constructor() {
    super('O e-mail do cliente é inválido.');
  }
}

export class CpfCnpjClienteInvalidoError extends DomainValidationError {
  constructor() {
    super('O CPF/CNPJ do cliente é inválido.');
  }
}

export class TelefoneClienteInvalidoError extends DomainValidationError {
  constructor() {
    super('O telefone do cliente é inválido.');
  }
}

export class ClienteNaoEncontradoError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Cliente com id "${id}" não encontrado.`);
  }
}

export class ClienteJaExisteError extends DomainConflictError {
  constructor(message = 'Já existe um cliente com esse e-mail ou CPF/CNPJ.') {
    super(message);
  }
}
