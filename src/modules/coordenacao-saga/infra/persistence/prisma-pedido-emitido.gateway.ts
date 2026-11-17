import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type {
  PedidoEmitidoGateway,
  RegistrarPedidoEmitidoInput,
} from '../../application/ports/pedido-emitido.gateway';

@Injectable()
export class PrismaPedidoEmitidoGateway implements PedidoEmitidoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    contexto: ContextoTransacao,
    input: RegistrarPedidoEmitidoInput,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.pedidoEmitido.create({
      data: {
        id: randomUUID(),
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        tipo: input.tipo,
        destino: input.destino,
        eventId: input.eventId,
      },
    });
  }
}
