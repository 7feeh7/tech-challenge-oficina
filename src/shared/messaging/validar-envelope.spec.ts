import {
  EnvelopeMensagemInvalidoError,
  validarEnvelopeBase,
} from './validar-envelope';

describe('validarEnvelopeBase', () => {
  it('rejeita envelope vazio', () => {
    expect(() => validarEnvelopeBase(null)).toThrow(
      EnvelopeMensagemInvalidoError,
    );
  });

  it('rejeita quando falta eventId', () => {
    expect(() =>
      validarEnvelopeBase({
        eventType: 'billing.teste.v1',
        version: 1,
      }),
    ).toThrow(EnvelopeMensagemInvalidoError);
  });

  it('rejeita versão inválida', () => {
    expect(() =>
      validarEnvelopeBase({
        eventId: '1',
        eventType: 'billing.teste.v1',
        version: 0,
        occurredAt: new Date().toISOString(),
        source: 'billing',
        correlationId: '2',
        ordemServicoId: '3',
        rodada: 1,
        payload: {},
      }),
    ).toThrow(EnvelopeMensagemInvalidoError);
  });

  it('aceita envelope com campos obrigatórios', () => {
    const envelope = {
      eventId: '1',
      eventType: 'billing.teste.v1',
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'billing',
      correlationId: '2',
      ordemServicoId: '3',
      rodada: 1,
      payload: {},
    };
    expect(() => validarEnvelopeBase(envelope)).not.toThrow();
  });
});
