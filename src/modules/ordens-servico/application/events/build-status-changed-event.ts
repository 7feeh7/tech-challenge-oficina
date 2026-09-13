import { randomUUID } from 'crypto';
import { getCorrelationId } from '@/shared/http/correlation-id.context';
import { NotificacaoDeStatus } from '../ports/notificador-status.gateway';
import {
  STATUS_CHANGED_EVENT_TYPE,
  STATUS_CHANGED_EVENT_VERSION,
  StatusChangedEventV1,
} from './status-changed.event';

export function buildStatusChangedEvent(
  notificacao: NotificacaoDeStatus,
): StatusChangedEventV1 {
  return {
    version: STATUS_CHANGED_EVENT_VERSION,
    eventId: randomUUID(),
    eventType: STATUS_CHANGED_EVENT_TYPE,
    occurredAt: new Date().toISOString(),
    correlationId: getCorrelationId(),
    ordemServicoId: notificacao.ordemServicoId,
    numeroOS: notificacao.numeroOS,
    statusAnterior: notificacao.statusAnterior,
    statusNovo: notificacao.statusNovo,
    destinatario: {
      nome: notificacao.destinatario.nome,
      email: notificacao.destinatario.email,
    },
  };
}
