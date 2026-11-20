import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';

export const COMPENSACAO_AVANCO = Symbol('COMPENSACAO_AVANCO');

export interface CompensacaoAvancoInput {
  ordemServicoId: string;
  rodada: number;
  causationId: string;
}

export interface CompensacaoAvancoPort {
  avancarAposEntradaEmCancelamento(
    contexto: ContextoTransacao,
    input: CompensacaoAvancoInput,
  ): Promise<void>;

  avancarSeEmCancelamento(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
  ): Promise<void>;
}

export class CompensacaoAvancoNoop implements CompensacaoAvancoPort {
  async avancarAposEntradaEmCancelamento(): Promise<void> {}

  async avancarSeEmCancelamento(): Promise<void> {}
}
