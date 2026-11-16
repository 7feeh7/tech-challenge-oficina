import { Injectable } from '@nestjs/common';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type {
  OutboxGateway,
  RegistrarOutboxInput,
} from '../../application/ports/outbox.gateway';

@Injectable()
export class PrismaOutboxGateway implements OutboxGateway {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    contexto: ContextoTransacao,
    input: RegistrarOutboxInput,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.outboxMensagem.create({
      data: {
        eventId: input.eventId,
        eventType: input.eventType,
        envelope: input.envelope as object,
        correlationId: input.correlationId,
        destino: input.destino,
      },
    });
  }
}
