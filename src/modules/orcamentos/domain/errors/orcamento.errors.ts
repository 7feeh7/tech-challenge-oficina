import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
} from '@/shared/exceptions/domain.error';

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

/**
 * Só pode existir um orçamento vivo por OS: com dois aguardando aprovação, não
 * há como saber qual é a proposta vigente. Para propor outro valor, rejeite o
 * atual — a OS volta ao diagnóstico e um novo orçamento pode ser gerado.
 */
export class OrcamentoEmAbertoError extends DomainConflictError {
  constructor(ordemServicoId: string) {
    super(
      `A ordem de serviço "${ordemServicoId}" já possui um orçamento aguardando aprovação. Aprove ou rejeite o orçamento atual antes de gerar outro.`,
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
