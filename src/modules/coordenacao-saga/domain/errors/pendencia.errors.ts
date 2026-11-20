import { DomainNotFoundError } from '@/shared/exceptions/domain.error';
import { ErroNegocioInternoError } from '@/modules/rotas-internas/domain/erro-negocio-interno.error';

export class PendenciaNaoEncontradaError extends DomainNotFoundError {
  constructor(pendenciaId: string) {
    super(`Pendência "${pendenciaId}" não encontrada na ordem de serviço.`);
  }
}

export class PendenciaNaoElegivelError extends ErroNegocioInternoError {
  constructor(motivo: string) {
    super('PENDENCIA_NAO_ELEGIVEL', motivo, 409);
  }
}

export class EvidenciaBillingAusenteError extends ErroNegocioInternoError {
  constructor() {
    super(
      'EVIDENCIA_BILLING_AUSENTE',
      'Não há evidência de estorno integral concluído pelo Billing para o segundo pagamento.',
      409,
    );
  }
}
