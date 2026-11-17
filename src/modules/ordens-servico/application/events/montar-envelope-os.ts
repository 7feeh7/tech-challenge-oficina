import { randomUUID } from 'crypto';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';
import type { SugestaoItemOrdem } from '../../domain/entities/ordem-servico.entity';
import type { StatusOS } from '../../domain/status-os';

export const ORIGEM_OS_SERVICE = 'os-service';
export const VERSAO_ENVELOPE = 1;

export interface PayloadStatusChanged {
  numeroOS?: number;
  statusAnterior: StatusOS | null;
  statusNovo: StatusOS;
  destinatario: { nome: string; email: string };
}

export interface PayloadIniciarDiagnostico {
  veiculo: { placa: string; modelo: string };
  descricaoProblema: string | null;
  sugestoes: SugestaoItemOrdem[];
}

export interface MontarEnvelopeOsInput<T> {
  eventType: string;
  ordemServicoId: string;
  /** Sempre o `correlationId` persistido da OS, nunca o da requisição (D3.9). */
  correlationId: string;
  rodada: number;
  ocorridoEm: Date;
  causationId: string | null;
  payload: T;
  eventId?: string;
}

export function montarEnvelopeOs<T>(
  input: MontarEnvelopeOsInput<T>,
): EnvelopeMensagem<T> {
  return {
    eventId: input.eventId ?? randomUUID(),
    eventType: input.eventType,
    version: VERSAO_ENVELOPE,
    occurredAt: input.ocorridoEm.toISOString(),
    source: ORIGEM_OS_SERVICE,
    correlationId: input.correlationId,
    causationId: input.causationId,
    ordemServicoId: input.ordemServicoId,
    rodada: input.rodada,
    payload: input.payload,
  };
}
