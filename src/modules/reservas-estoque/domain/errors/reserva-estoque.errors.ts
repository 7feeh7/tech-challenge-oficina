import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

export interface ItemIndisponivelReserva {
  pecaId: string;
  disponivelAtual: number;
  solicitado: number;
}

export class EstoqueInsuficienteReservaError extends DomainConflictError {
  readonly itensIndisponiveis: ItemIndisponivelReserva[];

  constructor(itensIndisponiveis: ItemIndisponivelReserva[]) {
    super('Estoque insuficiente para reservar os itens solicitados.');
    this.itensIndisponiveis = itensIndisponiveis;
  }
}

export class ReservaEstoqueNaoEncontradaError extends DomainNotFoundError {
  constructor(ordemServicoId: string, rodada: number) {
    super(
      `Não há reserva ativa para a OS "${ordemServicoId}" na rodada ${rodada}.`,
    );
  }
}

export class ReservaJaProcessadaError extends DomainConflictError {
  constructor() {
    super('A reserva informada já foi liberada ou consumida.');
  }
}

export class ConteudoIdempotenciaDivergenteError extends DomainConflictError {
  constructor() {
    super('Mesma chave de idempotência com conteúdo diferente.');
  }
}

export class ItemReservaInvalidoError extends DomainValidationError {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

export class PendenciaInventarioNaoEncontradaError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Pendência de inventário "${id}" não encontrada.`);
  }
}

export class PendenciaInventarioJaResolvidaError extends DomainConflictError {
  constructor() {
    super('A pendência de inventário já foi resolvida.');
  }
}
