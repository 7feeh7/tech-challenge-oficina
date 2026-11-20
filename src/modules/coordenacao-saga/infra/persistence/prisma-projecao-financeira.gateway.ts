import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  NATUREZA_CONFIRMACAO_PAGAMENTO as NATUREZA_CONFIRMACAO,
  PREFIXO_ORDER_CONFIRMADA,
} from '@/modules/ordens-servico/domain/confirmacao-pagamento-projecao';
import type {
  ProjecaoFinanceiraGateway,
  RegistrarOrcamentoInput,
  RegistrarPagamentoInput,
} from '../../application/ports/projecao-financeira.gateway';

const NATUREZA_PAGAMENTO = 'PAGAMENTO';
const NATUREZA_ORCAMENTO = 'ORCAMENTO';

@Injectable()
export class PrismaProjecaoFinanceiraGateway implements ProjecaoFinanceiraGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarOrdersPagas(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<string[]> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const confirmacoes = await cliente.projecaoFinanceiraOs.findMany({
      where: { ordemServicoId, rodada, natureza: NATUREZA_CONFIRMACAO },
      select: { orderId: true },
    });
    return confirmacoes.map((c) =>
      c.orderId.slice(PREFIXO_ORDER_CONFIRMADA.length),
    );
  }

  async possuiOrderId(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    orderId: string,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const existe = await cliente.projecaoFinanceiraOs.findFirst({
      where: { ordemServicoId, rodada, orderId, natureza: NATUREZA_PAGAMENTO },
      select: { id: true },
    });
    return Boolean(existe);
  }

  async registrarPagamento(
    contexto: ContextoTransacao,
    input: RegistrarPagamentoInput,
  ): Promise<'criado' | 'duplicado'> {
    await this.registrarCobranca(contexto, input);
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const orderIdConfirmado = `${PREFIXO_ORDER_CONFIRMADA}${input.orderId}`;
    const existente = await cliente.projecaoFinanceiraOs.findFirst({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        orderId: orderIdConfirmado,
        natureza: NATUREZA_CONFIRMACAO,
      },
      select: { id: true },
    });
    if (existente) {
      return 'duplicado';
    }
    await cliente.projecaoFinanceiraOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        natureza: NATUREZA_CONFIRMACAO,
        cobrancaId: input.cobrancaId,
        orderId: orderIdConfirmado,
        valorCentavos: input.valorCentavos,
        eventId: input.eventId,
      },
    });
    return 'criado';
  }

  async registrarCobranca(
    contexto: ContextoTransacao,
    input: RegistrarPagamentoInput,
  ): Promise<'criado' | 'duplicado'> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const existente = await cliente.projecaoFinanceiraOs.findFirst({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        orderId: input.orderId,
        natureza: NATUREZA_PAGAMENTO,
      },
    });
    if (existente) {
      if (input.linkPagamento && !existente.linkPagamento) {
        await cliente.projecaoFinanceiraOs.update({
          where: { id: existente.id },
          data: { linkPagamento: input.linkPagamento },
        });
      }
      return 'duplicado';
    }
    await cliente.projecaoFinanceiraOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        natureza: NATUREZA_PAGAMENTO,
        cobrancaId: input.cobrancaId,
        orderId: input.orderId,
        valorCentavos: input.valorCentavos,
        linkPagamento: input.linkPagamento ?? null,
        eventId: input.eventId,
      },
    });
    return 'criado';
  }

  async registrarOrcamento(
    contexto: ContextoTransacao,
    input: RegistrarOrcamentoInput,
  ): Promise<'criado' | 'duplicado'> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const existente = await cliente.projecaoFinanceiraOs.findFirst({
      where: {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        orcamentoId: input.orcamentoId,
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
        natureza: NATUREZA_ORCAMENTO,
        orcamentoId: input.orcamentoId,
        orderId: `orcamento:${input.orcamentoId}`,
        valorCentavos: input.valorTotalCentavos,
        eventId: input.eventId,
      },
    });
    return 'criado';
  }

  async jaNotificouPagamentoDisponivel(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    orderId: string,
  ): Promise<boolean> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const linha = await cliente.projecaoFinanceiraOs.findFirst({
      where: {
        ordemServicoId,
        rodada,
        orderId,
        natureza: NATUREZA_PAGAMENTO,
      },
      select: { linkPagamento: true },
    });
    return Boolean(linha?.linkPagamento);
  }
}
