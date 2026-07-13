import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import {
  PaginaServicos,
  ServicoGateway,
} from '../../application/ports/servico.gateway';
import { Servico } from '../../domain/entities/servico.entity';
import { PrismaServicoMapper } from './prisma-servico.mapper';

@Injectable()
export class PrismaServicoGateway implements ServicoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Servico | null> {
    const raw = await this.prisma.servico.findUnique({ where: { id } });
    return raw ? PrismaServicoMapper.toDomain(raw) : null;
  }

  async existeComNome(nome: string): Promise<boolean> {
    const raw = await this.prisma.servico.findUnique({
      where: { nome },
      select: { id: true },
    });
    return raw !== null;
  }

  async nomePertenceAOutroServico(id: string, nome: string): Promise<boolean> {
    const raw = await this.prisma.servico.findFirst({
      where: { AND: [{ id: { not: id } }, { nome }] },
      select: { id: true },
    });
    return raw !== null;
  }

  async listar(
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginaServicos> {
    const where = search
      ? { nome: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [raw, total] = await Promise.all([
      this.prisma.servico.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.servico.count({ where }),
    ]);

    return { servicos: raw.map(PrismaServicoMapper.toDomain), total };
  }

  async criar(servico: Servico): Promise<Servico> {
    const raw = await this.prisma.servico.create({
      data: PrismaServicoMapper.toPersistence(servico),
    });
    return PrismaServicoMapper.toDomain(raw);
  }

  async atualizar(id: string, servico: Servico): Promise<Servico> {
    const raw = await this.prisma.servico.update({
      where: { id },
      data: PrismaServicoMapper.toPersistence(servico),
    });
    return PrismaServicoMapper.toDomain(raw);
  }

  async remover(id: string): Promise<void> {
    await this.prisma.servico.delete({ where: { id } });
  }
}
