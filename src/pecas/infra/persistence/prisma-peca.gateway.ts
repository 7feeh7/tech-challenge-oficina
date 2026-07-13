import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { PaginaPecas, PecaGateway } from '../../application/ports/peca.gateway';
import { Peca } from '../../domain/entities/peca.entity';
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

  async remover(id: string): Promise<void> {
    await this.prisma.peca.delete({ where: { id } });
  }
}
