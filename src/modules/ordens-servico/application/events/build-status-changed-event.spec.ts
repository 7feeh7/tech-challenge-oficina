import { correlationIdStorage } from '@/shared/http/correlation-id.context';
import { StatusOS } from '../../domain/status-os';
import { buildStatusChangedEvent } from './build-status-changed-event';
import {
  STATUS_CHANGED_EVENT_TYPE,
  STATUS_CHANGED_EVENT_VERSION,
} from './status-changed.event';

describe('buildStatusChangedEvent', () => {
  it('propagates correlation id from request context', () => {
    const event = correlationIdStorage.run({ correlationId: 'corr-test' }, () =>
      buildStatusChangedEvent({
        ordemServicoId: 'uuid-os1',
        destinatario: { nome: 'João', email: 'joao@email.com' },
        numeroOS: 7,
        statusAnterior: StatusOS.RECEBIDA,
        statusNovo: StatusOS.EM_DIAGNOSTICO,
      }),
    );

    expect(event).toMatchObject({
      version: STATUS_CHANGED_EVENT_VERSION,
      eventType: STATUS_CHANGED_EVENT_TYPE,
      correlationId: 'corr-test',
      ordemServicoId: 'uuid-os1',
      numeroOS: 7,
      statusNovo: StatusOS.EM_DIAGNOSTICO,
    });
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
