import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';
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

export class PatchOrdemServicoNaoPermitidoError extends DomainConflictError {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

export class ItensOficiaisNaoEditaveisError extends DomainConflictError {
  constructor() {
    super(
      'Os itens oficiais só podem ser alterados durante o diagnóstico da rodada vigente.',
    );
  }
}

export class DesistenciaNaoPermitidaError extends DomainConflictError {
  constructor(status: StatusOS) {
    super(`Desistência não permitida no status ${status}.`);
  }
}

export class MotivoDesistenciaObrigatorioError extends DomainValidationError {
  constructor() {
    super('O motivo da desistência é obrigatório.');
  }
}

export class RetiradaNaoPermitidaError extends DomainConflictError {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

export class DevolucaoTarefaFilaNaoPermitidaError extends DomainConflictError {
  constructor() {
    super(
      'Devolução à fila só é permitida na rodada 1, antes da conclusão do diagnóstico.',
    );
  }
}
