import { Inject, Injectable } from '@nestjs/common';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  DESTINO_FILA_BILLING,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import type { ProcessadorMensagem } from '@/shared/messaging/application/ports/processador-mensagem.port';
import { OUTBOX_GATEWAY } from '@/shared/messaging/application/ports/tokens';

export const EVENTO_TESTE_INTEGRACAO = 'mensageria.teste-integracao.v1';

@Injectable()
export class ProcessadorIntegracaoMensagem implements ProcessadorMensagem {
  readonly eventType = EVENTO_TESTE_INTEGRACAO;

  constructor(
    @Inject(OUTBOX_GATEWAY)
    private readonly outbox: OutboxGateway,
  ) {}

  async processar(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem<{ marcador: string }>,
  ): Promise<void> {
    const eco: EnvelopeMensagem<{ recebido: string }> = {
      eventId: envelope.payload.marcador,
      eventType: 'mensageria.eco-integracao.v1',
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'os-service',
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      ordemServicoId: envelope.ordemServicoId,
      rodada: envelope.rodada,
      payload: { recebido: envelope.payload.marcador },
    };

    await this.outbox.registrar(contexto, {
      eventId: eco.eventId,
      eventType: eco.eventType,
      envelope: eco,
      correlationId: envelope.correlationId,
      destino: DESTINO_FILA_BILLING,
    });
  }
}
