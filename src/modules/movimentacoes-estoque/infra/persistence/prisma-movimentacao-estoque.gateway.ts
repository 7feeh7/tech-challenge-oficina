import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  MovimentacaoComPeca,
  MovimentacaoEstoqueGateway,
  PaginaMovimentacoes,
} from '../../application/ports/movimentacao-estoque.gateway';
import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';
import { PrismaMovimentacaoEstoqueMapper } from './prisma-movimentacao-estoque.mapper';

const SELECT_PECA = { select: { id: true, codigo: true, nome: true } };

@Injectable()
export class PrismaMovimentacaoEstoqueGateway implements MovimentacaoEstoqueGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarSaldoDaPeca(pecaId: string): Promise<number | null> {
    const peca = await this.prisma.peca.findUnique({
      where: { id: pecaId },
      select: { quantidadeEstoque: true },
    });
    return peca ? peca.quantidadeEstoque : null;
  }

  async buscarComPecaPorId(id: string): Promise<MovimentacaoComPeca | null> {
    const raw = await this.prisma.movimentacaoEstoque.findUnique({
      where: { id },
      include: { peca: SELECT_PECA },
    });
    return raw ? this.toMovimentacaoComPeca(raw) : null;
  }

  async listar(
    page: number,
    limit: number,
    pecaId?: string,
  ): Promise<PaginaMovimentacoes> {
    const where = pecaId ? { pecaId } : {};

    const [raw, total] = await Promise.all([
      this.prisma.movimentacaoEstoque.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { peca: SELECT_PECA },
      }),
      this.prisma.movimentacaoEstoque.count({ where }),
    ]);

    return {
      movimentacoes: raw.map((item) => this.toMovimentacaoComPeca(item)),
      total,
    };
  }

  /** As duas escritas vão na mesma transação: histórico e saldo nunca divergem. */
  async registrar(
    movimentacao: MovimentacaoEstoque,
    novoSaldo: number,
  ): Promise<MovimentacaoComPeca> {
    const [raw] = await this.prisma.$transaction([
      this.prisma.movimentacaoEstoque.create({
        data: PrismaMovimentacaoEstoqueMapper.toPersistence(movimentacao),
        include: { peca: SELECT_PECA },
      }),
      this.prisma.peca.update({
        where: { id: movimentacao.pecaId },
        data: { quantidadeEstoque: novoSaldo },
      }),
    ]);

    return this.toMovimentacaoComPeca(raw);
  }

  private toMovimentacaoComPeca(
    raw: Parameters<typeof PrismaMovimentacaoEstoqueMapper.toDomain>[0] & {
      peca: { id: string; codigo: string; nome: string };
    },
  ): MovimentacaoComPeca {
    const { peca, ...movimentacao } = raw;

    return {
      movimentacao: PrismaMovimentacaoEstoqueMapper.toDomain(movimentacao),
      peca,
    };
  }
}
