import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type {
  ProjecaoFinanceiraGateway,
  RegistrarPagamentoInput,
} from '../../application/ports/projecao-financeira.gateway';

@Injectable()
export class PrismaProjecaoFinanceiraGateway implements ProjecaoFinanceiraGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarOrderIdPrincipal(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<string | null> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const primeira = await cliente.projecaoFinanceiraOs.findFirst({
      where: { ordemServicoId, rodada },
      orderBy: { criadoEm: 'asc' },
      select: { orderId: true },
    });
    return primeira?.orderId ?? null;
  }

  async possuiOrderId(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    orderId: string,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const existe = await cliente.projecaoFinanceiraOs.findFirst({
      where: { ordemServicoId, rodada, orderId },
      select: { id: true },
    });
    return Boolean(existe);
  }

  async registrarPagamento(
    contexto: ContextoTransacao,
    input: RegistrarPagamentoInput,
  ): Promise<'criado' | 'duplicado'> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const existente = await cliente.projecaoFinanceiraOs.findFirst({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        orderId: input.orderId,
      },
    });
    if (existente) {
      return 'duplicado';
    }
    await cliente.projecaoFinanceiraOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        cobrancaId: input.cobrancaId,
        orderId: input.orderId,
        valorCentavos: input.valorCentavos,
        eventId: input.eventId,
      },
    });
    return 'criado';
  }
}
