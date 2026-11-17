import { STATUS_CHANGED_EVENT_TYPE } from './status-changed.event';
import { montarEnvelopeOs, ORIGEM_OS_SERVICE } from './montar-envelope-os';
import { StatusOS } from '../../domain/status-os';

describe('montarEnvelopeOs', () => {
  it('gera eventId quando omitido', () => {
    const envelope = montarEnvelopeOs({
      eventType: STATUS_CHANGED_EVENT_TYPE,
      ordemServicoId: 'os-1',
      correlationId: 'corr',
      rodada: 1,
      ocorridoEm: new Date(),
      causationId: null,
      payload: {
        numeroOS: 1,
        statusAnterior: null,
        statusNovo: StatusOS.RECEBIDA,
        destinatario: { nome: 'Ana', email: 'a@x.com' },
      },
    });

    expect(envelope.eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('usa o correlationId persistido da OS', () => {
    const envelope = montarEnvelopeOs({
      eventType: STATUS_CHANGED_EVENT_TYPE,
      ordemServicoId: 'os-1',
      correlationId: 'corr-persistido',
      rodada: 2,
      ocorridoEm: new Date('2026-11-16T12:00:00.000Z'),
      causationId: 'evt-pai',
      payload: {
        numeroOS: 7,
        statusAnterior: StatusOS.RECEBIDA,
        statusNovo: StatusOS.EM_DIAGNOSTICO,
        destinatario: { nome: 'Ana', email: 'a@x.com' },
      },
      eventId: 'evt-1',
    });

    expect(envelope.correlationId).toBe('corr-persistido');
    expect(envelope.source).toBe(ORIGEM_OS_SERVICE);
    expect(envelope.eventId).toBe('evt-1');
  });
});
