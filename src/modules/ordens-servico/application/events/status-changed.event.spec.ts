import { StatusOS } from '../../domain/status-os';
import {
  InvalidStatusChangedEventError,
  STATUS_CHANGED_EVENT_TYPE,
  STATUS_CHANGED_EVENT_VERSION,
  parseStatusChangedEvent,
} from './status-changed.event';

const eventoValido = {
  version: STATUS_CHANGED_EVENT_VERSION,
  eventId: 'evt-1',
  eventType: STATUS_CHANGED_EVENT_TYPE,
  occurredAt: '2026-09-13T12:00:00.000Z',
  correlationId: 'corr-1',
  ordemServicoId: 'uuid-os1',
  numeroOS: 42,
  statusAnterior: StatusOS.RECEBIDA,
  statusNovo: StatusOS.EM_DIAGNOSTICO,
  destinatario: { nome: 'João', email: 'joao@email.com' },
};

describe('parseStatusChangedEvent', () => {
  it('accepts a valid v1 event', () => {
    expect(parseStatusChangedEvent(eventoValido)).toEqual(eventoValido);
  });

  it('rejects unsupported versions', () => {
    expect(() =>
      parseStatusChangedEvent({ ...eventoValido, version: 2 }),
    ).toThrow(InvalidStatusChangedEventError);
  });

  it('rejects invalid event type', () => {
    expect(() =>
      parseStatusChangedEvent({ ...eventoValido, eventType: 'other' }),
    ).toThrow(InvalidStatusChangedEventError);
  });

  it('rejects missing ordemServicoId', () => {
    expect(() =>
      parseStatusChangedEvent({ ...eventoValido, ordemServicoId: '' }),
    ).toThrow(InvalidStatusChangedEventError);
  });
});
