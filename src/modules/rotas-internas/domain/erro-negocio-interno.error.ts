import { DomainError } from '@/shared/exceptions/domain.error';

/** Erro com `codigo` estável para contratos REST internos (03-service-boundaries). */
export class ErroNegocioInternoError extends DomainError {
  constructor(
    readonly codigo: string,
    readonly mensagem: string,
    readonly statusHttp: number,
    readonly detalhes: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}
