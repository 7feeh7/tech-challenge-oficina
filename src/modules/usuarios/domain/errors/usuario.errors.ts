import {
  DomainConflictError,
  DomainNotFoundError,
  DomainUnauthorizedError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

export class NomeUsuarioInvalidoError extends DomainValidationError {
  constructor() {
    super('O nome do usuário deve possuir entre 3 e 100 caracteres.');
  }
}

export class EmailUsuarioInvalidoError extends DomainValidationError {
  constructor() {
    super('O e-mail do usuário é inválido.');
  }
}

export class SenhaHashInvalidaError extends DomainValidationError {
  constructor() {
    super('O hash da senha do usuário é obrigatório.');
  }
}

export class UsuarioNaoEncontradoError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Usuário com id "${id}" não encontrado.`);
  }
}

export class EmailUsuarioJaExisteError extends DomainConflictError {
  constructor(message = 'Já existe um usuário com esse e-mail.') {
    super(message);
  }
}

/** Mensagem genérica de propósito: não revela se o e-mail existe ou se o usuário está inativo. */
export class CredenciaisInvalidasError extends DomainUnauthorizedError {
  constructor() {
    super('Credenciais inválidas.');
  }
}
