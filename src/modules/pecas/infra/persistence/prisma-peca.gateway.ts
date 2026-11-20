import { Injectable } from '@nestjs/common';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { PaginaPecas, PecaGateway } from '../../application/ports/peca.gateway';
import type { AtualizarPecaInput } from '../../application/use-cases/atualizar-peca.use-case';
import { Peca } from '../../domain/entities/peca.entity';
import {
  EstoqueFisicoAbaixoReservadoError,
  PecaNaoEncontradaError,
} from '../../domain/errors/peca.errors';
import { PrismaPecaMapper } from './prisma-peca.mapper';

@Injectable()
export class PrismaPecaGateway implements PecaGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Peca | null> {
    const raw = await this.prisma.peca.findUnique({ where: { id } });
    return raw ? PrismaPecaMapper.toDomain(raw) : null;
  }

  async existeComCodigo(codigo: string): Promise<boolean> {
    const raw = await this.prisma.peca.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return raw !== null;
  }

  async codigoPertenceAOutraPeca(id: string, codigo: string): Promise<boolean> {
    const raw = await this.prisma.peca.findFirst({
      where: { AND: [{ id: { not: id } }, { codigo }] },
      select: { id: true },
    });
    return raw !== null;
  }

  async listar(
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginaPecas> {
    const where = search
      ? {
          OR: [
            { nome: { contains: search, mode: 'insensitive' as const } },
            { codigo: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [raw, total] = await Promise.all([
      this.prisma.peca.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.peca.count({ where }),
    ]);

    return { pecas: raw.map(PrismaPecaMapper.toDomain), total };
  }

  async criar(peca: Peca): Promise<Peca> {
    const raw = await this.prisma.peca.create({
      data: PrismaPecaMapper.toPersistence(peca),
    });
    return PrismaPecaMapper.toDomain(raw);
  }

  async atualizar(id: string, peca: Peca): Promise<Peca> {
    const raw = await this.prisma.peca.update({
      where: { id },
      data: PrismaPecaMapper.toPersistence(peca),
    });
    return PrismaPecaMapper.toDomain(raw);
  }

  async atualizarNoContexto(
    contexto: ContextoTransacao,
    id: string,
    peca: Peca,
    input: AtualizarPecaInput,
  ): Promise<Peca> {
    const cliente = obterClienteTransacao(contexto, this.prisma);

    if (input.quantidadeEstoque !== undefined) {
      const linhas = await cliente.$queryRaw<
        { quantidade_reservada: number }[]
      >`
        SELECT quantidade_reservada
        FROM pecas
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      const reservado = linhas[0]?.quantidade_reservada;
      if (reservado === undefined) {
        throw new PecaNaoEncontradaError(id);
      }

      if (input.quantidadeEstoque < reservado) {
        throw new EstoqueFisicoAbaixoReservadoError();
      }

      const atualizado = await cliente.$executeRaw`
        UPDATE pecas
        SET quantidade_estoque = ${input.quantidadeEstoque}
        WHERE id = ${id}::uuid
          AND quantidade_reservada <= ${input.quantidadeEstoque}
      `;

      if (atualizado !== 1) {
        throw new EstoqueFisicoAbaixoReservadoError();
      }
    }

    const data = PrismaPecaMapper.toPersistenceParcial(peca, input);

    const raw = await cliente.peca.update({
      where: { id },
      data,
    });
    return PrismaPecaMapper.toDomain(raw);
  }

  async remover(id: string): Promise<void> {
    await this.prisma.peca.delete({ where: { id } });
  }
}
