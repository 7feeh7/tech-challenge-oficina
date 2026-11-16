import { DomainValidationError } from '@/shared/exceptions/domain.error';
import type { EnvelopeMensagem } from './envelope';

export class EnvelopeMensagemInvalidoError extends DomainValidationError {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

export function validarEnvelopeBase(
  envelope: unknown,
): asserts envelope is EnvelopeMensagem {
  if (!envelope || typeof envelope !== 'object') {
    throw new EnvelopeMensagemInvalidoError('Envelope da mensagem inválido.');
  }

  const e = envelope as Record<string, unknown>;
  const obrigatorios = [
    'eventId',
    'eventType',
    'version',
    'occurredAt',
    'source',
    'correlationId',
    'ordemServicoId',
    'rodada',
    'payload',
  ];

  for (const campo of obrigatorios) {
    if (e[campo] === undefined || e[campo] === null) {
      throw new EnvelopeMensagemInvalidoError(
        `Campo obrigatório ausente no envelope: ${campo}.`,
      );
    }
  }

  if (typeof e.version !== 'number' || e.version < 1) {
    throw new EnvelopeMensagemInvalidoError('Versão do envelope inválida.');
  }
}
