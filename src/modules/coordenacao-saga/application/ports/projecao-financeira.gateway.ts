import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';

export interface RegistrarPagamentoInput {
  ordemServicoId: string;
  rodada: number;
  cobrancaId: string | null;
  orderId: string;
  valorCentavos: number | null;
  eventId: string;
  linkPagamento?: string | null;
}

export interface RegistrarOrcamentoInput {
  ordemServicoId: string;
  rodada: number;
  orcamentoId: string;
  valorTotalCentavos: number;
  eventId: string;
}

export interface ProjecaoFinanceiraGateway {
  buscarOrderIdPrincipal(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<string | null>;

  registrarPagamento(
    contexto: ContextoTransacao,
    input: RegistrarPagamentoInput,
  ): Promise<'criado' | 'duplicado'>;

  registrarOrcamento(
    contexto: ContextoTransacao,
    input: RegistrarOrcamentoInput,
  ): Promise<'criado' | 'duplicado'>;

  possuiOrderId(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    orderId: string,
  ): Promise<boolean>;

  jaNotificouPagamentoDisponivel(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    orderId: string,
  ): Promise<boolean>;
}
