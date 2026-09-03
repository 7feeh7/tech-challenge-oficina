import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

export class PlacaVeiculoInvalidaError extends DomainValidationError {
  constructor() {
    super('A placa do veículo é inválida (formato Mercosul ou antigo).');
  }
}

export class MarcaVeiculoInvalidaError extends DomainValidationError {
  constructor() {
    super('A marca do veículo deve possuir entre 2 e 50 caracteres.');
  }
}

export class ModeloVeiculoInvalidoError extends DomainValidationError {
  constructor() {
    super('O modelo do veículo deve possuir entre 1 e 50 caracteres.');
  }
}

export class AnoVeiculoInvalidoError extends DomainValidationError {
  constructor(anoMaximo: number) {
    super(`O ano do veículo deve estar entre 1886 e ${anoMaximo}.`);
  }
}

export class ClienteDoVeiculoObrigatorioError extends DomainValidationError {
  constructor() {
    super('O veículo deve pertencer a um cliente.');
  }
}

export class VeiculoNaoEncontradoError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Veículo com id "${id}" não encontrado.`);
  }
}

export class ClienteDoVeiculoNaoEncontradoError extends DomainNotFoundError {
  constructor(clienteId: string) {
    super(`Cliente com id "${clienteId}" não encontrado.`);
  }
}

export class PlacaVeiculoJaExisteError extends DomainConflictError {
  constructor(message = 'Já existe um veículo com essa placa.') {
    super(message);
  }
}
