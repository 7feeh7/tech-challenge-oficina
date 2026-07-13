/**
 * Base das exceções de domínio. O domínio lança estes erros sem conhecer HTTP;
 * o DomainExceptionFilter traduz cada categoria para o status correspondente.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Invariante de domínio violada (ex.: nome fora do tamanho permitido). */
export abstract class DomainValidationError extends DomainError {}

/** Recurso inexistente. */
export abstract class DomainNotFoundError extends DomainError {}

/** Conflito com o estado atual (ex.: e-mail já cadastrado). */
export abstract class DomainConflictError extends DomainError {}

/** Credenciais ausentes ou inválidas. */
export abstract class DomainUnauthorizedError extends DomainError {}
