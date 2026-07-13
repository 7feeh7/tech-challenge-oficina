import {
  DomainNotFoundError,
  DomainValidationError,
} from '@/common/exceptions/domain.error';
import { StatusOS } from '../status-os';

export class TransicaoStatusInvalidaError extends DomainValidationError {
  constructor(atual: StatusOS, novo: StatusOS) {
    super(`Transição de status inválida: ${atual} → ${novo}.`);
  }
}

export class VeiculoNaoPertenceAoClienteError extends DomainValidationError {
  constructor() {
    super('O veículo não pertence ao cliente informado.');
  }
}

export class QuantidadeItemInvalidaError extends DomainValidationError {
  constructor() {
    super('A quantidade do item deve ser um inteiro maior que zero.');
  }
}

export class PrecoItemInvalidoError extends DomainValidationError {
  constructor() {
    super('O preço do item deve ser um valor positivo.');
  }
}

export class OrdemServicoNaoEncontradaError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Ordem de serviço "${id}" não encontrada.`);
  }
}

export class ClienteDaOrdemNaoEncontradoError extends DomainNotFoundError {
  constructor(clienteId: string) {
    super(`Cliente "${clienteId}" não encontrado.`);
  }
}

export class VeiculoDaOrdemNaoEncontradoError extends DomainNotFoundError {
  constructor(veiculoId: string) {
    super(`Veículo "${veiculoId}" não encontrado.`);
  }
}

export class ServicoDaOrdemNaoEncontradoError extends DomainNotFoundError {
  constructor(servicoId: string) {
    super(`Serviço "${servicoId}" não encontrado.`);
  }
}

export class PecaDaOrdemNaoEncontradaError extends DomainNotFoundError {
  constructor(pecaId: string) {
    super(`Peça "${pecaId}" não encontrada.`);
  }
}
