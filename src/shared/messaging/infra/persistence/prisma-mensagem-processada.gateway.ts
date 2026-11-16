import { Injectable } from '@nestjs/common';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type { MensagemProcessadaGateway } from '../../application/ports/mensagem-processada.gateway';

@Injectable()
export class PrismaMensagemProcessadaGateway implements MensagemProcessadaGateway {
  constructor(private readonly prisma: PrismaService) {}

  async jaProcessada(
    contexto: ContextoTransacao,
    eventId: string,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const registro = await cliente.mensagemProcessada.findUnique({
      where: { eventId },
      select: { eventId: true },
    });
    return registro !== null;
  }

  async registrar(
    contexto: ContextoTransacao,
    eventId: string,
    hashConteudo: string,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.mensagemProcessada.create({
      data: { eventId, hashConteudo },
    });
  }

  async buscarHash(
    contexto: ContextoTransacao,
    eventId: string,
  ): Promise<string | null> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const registro = await cliente.mensagemProcessada.findUnique({
      where: { eventId },
      select: { hashConteudo: true },
    });
    return registro?.hashConteudo ?? null;
  }
}
