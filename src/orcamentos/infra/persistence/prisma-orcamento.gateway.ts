import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { StatusOS, TipoMovimentacaoEstoque } from '@/generated/prisma/enums';
import {
  BaixaDeEstoque,
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

  async buscarOrdemComPecas(
    ordemServicoId: string,
  ): Promise<OrdemDoOrcamento | null> {
    const ordem = await this.prisma.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: {
        id: true,
        pecas: {
          select: {
            pecaId: true,
            quantidade: true,
            peca: { select: { quantidadeEstoque: true } },
          },
        },
      },
    });
    if (!ordem) return null;

    return {
      id: ordem.id,
      pecas: ordem.pecas.map((item) => ({
        pecaId: item.pecaId,
        quantidade: item.quantidade,
        saldoDisponivel: item.peca.quantidadeEstoque,
      })),
    };
  }

  /** Orçamento criado e OS movida para AGUARDANDO_APROVACAO na mesma transação. */
  async criarEEnviarParaAprovacao(orcamento: Orcamento): Promise<Orcamento> {
    const raw = await this.prisma.$transaction(async (tx) => {
      const ordem = await tx.ordemServico.findUniqueOrThrow({
        where: { id: orcamento.ordemServicoId },
        select: { status: true },
      });

      const criado = await tx.orcamento.create({
        data: PrismaOrcamentoMapper.toPersistence(orcamento),
      });

      await tx.ordemServico.update({
        where: { id: orcamento.ordemServicoId },
        data: { status: StatusOS.AGUARDANDO_APROVACAO },
      });

      await tx.historicoStatusOS.create({
        data: {
          ordemServicoId: orcamento.ordemServicoId,
          statusAnterior: ordem.status,
          statusNovo: StatusOS.AGUARDANDO_APROVACAO,
          observacao: 'Orçamento gerado',
        },
      });

      return criado;
    });

    return PrismaOrcamentoMapper.toDomain(raw);
  }

  async atualizar(id: string, orcamento: Orcamento): Promise<Orcamento> {
    const raw = await this.prisma.orcamento.update({
      where: { id },
      data: PrismaOrcamentoMapper.toPersistence(orcamento),
    });
    return PrismaOrcamentoMapper.toDomain(raw);
  }

  /**
   * Aprovação: grava o orçamento, põe a OS EM_EXECUCAO, registra o histórico e
   * baixa o estoque de cada peça — tudo na mesma transação. Se qualquer passo
   * falhar, nenhuma baixa é aplicada.
   */
  async aprovarComBaixaDeEstoque(
    orcamento: Orcamento,
    baixas: BaixaDeEstoque[],
  ): Promise<Orcamento> {
    const raw = await this.prisma.$transaction(async (tx) => {
      const ordem = await tx.ordemServico.findUniqueOrThrow({
        where: { id: orcamento.ordemServicoId },
        select: { status: true, iniciadaEm: true },
      });

      const aprovado = await tx.orcamento.update({
        where: { id: orcamento.id },
        data: PrismaOrcamentoMapper.toPersistence(orcamento),
      });

      await tx.ordemServico.update({
        where: { id: orcamento.ordemServicoId },
        data: {
          status: StatusOS.EM_EXECUCAO,
          iniciadaEm: ordem.iniciadaEm ?? new Date(),
        },
      });

      await tx.historicoStatusOS.create({
        data: {
          ordemServicoId: orcamento.ordemServicoId,
          statusAnterior: ordem.status,
          statusNovo: StatusOS.EM_EXECUCAO,
          observacao: 'Orçamento aprovado',
        },
      });

      for (const baixa of baixas) {
        await tx.movimentacaoEstoque.create({
          data: {
            pecaId: baixa.pecaId,
            tipo: TipoMovimentacaoEstoque.BAIXA,
            quantidade: baixa.quantidade,
            ordemServicoId: orcamento.ordemServicoId,
            observacao: 'Baixa automática por aprovação de orçamento',
          },
        });

        await tx.peca.update({
          where: { id: baixa.pecaId },
          data: { quantidadeEstoque: baixa.novoSaldo },
        });
      }

      return aprovado;
    });

    return PrismaOrcamentoMapper.toDomain(raw);
  }

  async remover(id: string): Promise<void> {
    await this.prisma.orcamento.delete({ where: { id } });
  }
}
