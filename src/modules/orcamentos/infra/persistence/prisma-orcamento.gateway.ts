import { Injectable } from '@nestjs/common';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { StatusOrcamento as StatusOrcamentoPrisma } from '@/shared/generated/prisma/enums';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  OrcamentoGateway,
  OrdemDoOrcamento,
  PaginaOrcamentos,
} from '../../application/ports/orcamento.gateway';
import { Orcamento } from '../../domain/entities/orcamento.entity';
import { PrismaOrcamentoMapper } from './prisma-orcamento.mapper';

@Injectable()
export class PrismaOrcamentoGateway implements OrcamentoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Orcamento | null> {
    const raw = await this.prisma.orcamento.findUnique({ where: { id } });
    return raw ? PrismaOrcamentoMapper.toDomain(raw) : null;
  }

  async listar(
    page: number,
    limit: number,
    ordemServicoId?: string,
  ): Promise<PaginaOrcamentos> {
    const where = ordemServicoId ? { ordemServicoId } : {};

    const [raw, total] = await Promise.all([
      this.prisma.orcamento.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.orcamento.count({ where }),
    ]);

    return { orcamentos: raw.map(PrismaOrcamentoMapper.toDomain), total };
  }

  async buscarOrdemParaOrcamento(
    ordemServicoId: string,
  ): Promise<OrdemDoOrcamento | null> {
    const ordem = await this.prisma.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: {
        id: true,
        status: true,
        rodadaVigente: true,
        pecas: { select: { pecaId: true, quantidade: true } },
      },
    });
    if (!ordem) return null;

    return {
      id: ordem.id,
      status: ordem.status as unknown as StatusOS,
      rodadaVigente: ordem.rodadaVigente,
      pecas: ordem.pecas.map((item) => ({
        pecaId: item.pecaId,
        quantidade: item.quantidade,
      })),
    };
  }

  async existeOrcamentoAguardandoAprovacao(
    ordemServicoId: string,
  ): Promise<boolean> {
    const raw = await this.prisma.orcamento.findFirst({
      where: {
        ordemServicoId,
        status: StatusOrcamentoPrisma.AGUARDANDO_APROVACAO,
      },
      select: { id: true },
    });
    return raw !== null;
  }

  async criar(
    contexto: ContextoTransacao,
    orcamento: Orcamento,
  ): Promise<Orcamento> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const criado = await cliente.orcamento.create({
      data: PrismaOrcamentoMapper.toPersistence(orcamento),
    });
    return PrismaOrcamentoMapper.toDomain(criado);
  }

  async atualizar(
    contexto: ContextoTransacao,
    orcamento: Orcamento,
  ): Promise<Orcamento> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const raw = await cliente.orcamento.update({
      where: { id: orcamento.id! },
      data: PrismaOrcamentoMapper.toPersistence(orcamento),
    });
    return PrismaOrcamentoMapper.toDomain(raw);
  }

  async remover(id: string): Promise<void> {
    await this.prisma.orcamento.delete({ where: { id } });
  }
}
