import { Injectable } from '@nestjs/common';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  MovimentacaoComPeca,
  MovimentacaoEstoqueGateway,
  PaginaMovimentacoes,
} from '../../application/ports/movimentacao-estoque.gateway';
import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';
import {
  EstoqueInsuficienteError,
  PecaDaMovimentacaoNaoEncontradaError,
} from '../../domain/errors/movimentacao-estoque.errors';
import { PrismaMovimentacaoEstoqueMapper } from './prisma-movimentacao-estoque.mapper';

const SELECT_PECA = { select: { id: true, codigo: true, nome: true } };

@Injectable()
export class PrismaMovimentacaoEstoqueGateway implements MovimentacaoEstoqueGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarSaldosDaPeca(pecaId: string) {
    const peca = await this.prisma.peca.findUnique({
      where: { id: pecaId },
      select: { quantidadeEstoque: true, quantidadeReservada: true },
    });
    if (!peca) {
      return null;
    }
    return {
      quantidadeFisica: peca.quantidadeEstoque,
      quantidadeReservada: peca.quantidadeReservada,
      quantidadeDisponivel: peca.quantidadeEstoque - peca.quantidadeReservada,
    };
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

  async registrar(
    contexto: ContextoTransacao,
    movimentacao: MovimentacaoEstoque,
  ): Promise<MovimentacaoComPeca> {
    const cliente = obterClienteTransacao(contexto, this.prisma);

    const saldos = await cliente.$queryRaw<
      {
        id: string;
        quantidade_estoque: number;
        quantidade_reservada: number;
        codigo: string;
        nome: string;
      }[]
    >`
      SELECT id, quantidade_estoque, quantidade_reservada, codigo, nome
      FROM pecas
      WHERE id = ${movimentacao.pecaId}::uuid
      FOR UPDATE
    `;

    const pecaRow = saldos[0];
    if (!pecaRow) {
      throw new PecaDaMovimentacaoNaoEncontradaError(movimentacao.pecaId);
    }

    const disponivel =
      pecaRow.quantidade_estoque - pecaRow.quantidade_reservada;

    if (movimentacao.ehEntrada()) {
      const atualizado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_estoque = quantidade_estoque + ${movimentacao.quantidade}
        WHERE id = ${movimentacao.pecaId}::uuid
      `;
      if (atualizado !== 1) {
        throw new PecaDaMovimentacaoNaoEncontradaError(movimentacao.pecaId);
      }
    } else {
      if (movimentacao.quantidade > disponivel) {
        throw new EstoqueInsuficienteError(disponivel, movimentacao.quantidade);
      }

      const atualizado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_estoque = quantidade_estoque - ${movimentacao.quantidade}
        WHERE id = ${movimentacao.pecaId}::uuid
          AND quantidade_estoque - quantidade_reservada >= ${movimentacao.quantidade}
      `;

      if (atualizado !== 1) {
        throw new EstoqueInsuficienteError(disponivel, movimentacao.quantidade);
      }
    }

    const raw = await cliente.movimentacaoEstoque.create({
      data: PrismaMovimentacaoEstoqueMapper.toPersistence(movimentacao),
      include: { peca: SELECT_PECA },
    });

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
