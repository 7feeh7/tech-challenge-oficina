import {
  DomainNotFoundError,
  DomainValidationError,
} from '@/common/exceptions/domain.error';

export class ValorOrcamentoInvalidoError extends DomainValidationError {
  constructor() {
    super('O valor total do orçamento deve ser um valor positivo.');
  }
}

export class MotivoRejeicaoObrigatorioError extends DomainValidationError {
  constructor() {
    super('Informe o motivo da rejeição.');
  }
}

/** Aprovar exige estoque para todas as peças da OS — a baixa é automática. */
export class EstoqueInsuficienteParaAprovacaoError extends DomainValidationError {
  constructor(pecaId: string, disponivel: number, solicitado: number) {
    super(
      `Estoque insuficiente para a peça "${pecaId}". Disponível: ${disponivel}, solicitado: ${solicitado}.`,
    );
  }
}

export class OrcamentoNaoEncontradoError extends DomainNotFoundError {
  constructor(id: string) {
    super(`Orçamento "${id}" não encontrado.`);
  }
}

export class OrdemDoOrcamentoNaoEncontradaError extends DomainNotFoundError {
  constructor(ordemServicoId: string) {
    super(`Ordem de serviço "${ordemServicoId}" não encontrada.`);
  }
}
