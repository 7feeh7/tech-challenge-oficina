import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  SituacaoPedidoSaga,
  type TipoPedidoSaga,
} from '@/shared/generated/prisma/enums';
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

  async existeEmitido(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    tipo: TipoPedidoSaga,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const registro = await cliente.pedidoEmitido.findFirst({
      where: {
        ordemServicoId,
        rodada,
        tipo,
        situacao: SituacaoPedidoSaga.EMITIDO,
      },
      select: { id: true },
    });
    return Boolean(registro);
  }

  async marcarConcluidoPorTipo(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    tipo: TipoPedidoSaga,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.pedidoEmitido.updateMany({
      where: {
        ordemServicoId,
        rodada,
        tipo,
        situacao: SituacaoPedidoSaga.EMITIDO,
      },
      data: { situacao: SituacaoPedidoSaga.CONCLUIDO },
    });
  }
}
