import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  PaginaVeiculos,
  VeiculoComCliente,
  VeiculoGateway,
} from '../../application/ports/veiculo.gateway';
import { Veiculo } from '../../domain/entities/veiculo.entity';
import { PrismaVeiculoMapper } from './prisma-veiculo.mapper';

@Injectable()
export class PrismaVeiculoGateway implements VeiculoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Veiculo | null> {
    const raw = await this.prisma.veiculo.findUnique({ where: { id } });
    return raw ? PrismaVeiculoMapper.toDomain(raw) : null;
  }

  async buscarComClientePorId(id: string): Promise<VeiculoComCliente | null> {
    const raw = await this.prisma.veiculo.findUnique({
      where: { id },
      include: { cliente: { select: { id: true, nome: true } } },
    });
    if (!raw) return null;

    const { cliente, ...veiculo } = raw;

    return { veiculo: PrismaVeiculoMapper.toDomain(veiculo), cliente };
  }

  async existeComPlaca(placa: string): Promise<boolean> {
    const raw = await this.prisma.veiculo.findUnique({
      where: { placa },
      select: { id: true },
    });
    return raw !== null;
  }

  async placaPertenceAOutroVeiculo(
    id: string,
    placa: string,
  ): Promise<boolean> {
    const raw = await this.prisma.veiculo.findFirst({
      where: { AND: [{ id: { not: id } }, { placa }] },
      select: { id: true },
    });
    return raw !== null;
  }

  async listar(
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginaVeiculos> {
    const where = search
      ? {
          OR: [
            { placa: { contains: search, mode: 'insensitive' as const } },
            { modelo: { contains: search, mode: 'insensitive' as const } },
            { marca: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [raw, total] = await Promise.all([
      this.prisma.veiculo.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.veiculo.count({ where }),
    ]);

    return { veiculos: raw.map(PrismaVeiculoMapper.toDomain), total };
  }

  async criar(veiculo: Veiculo): Promise<Veiculo> {
    const raw = await this.prisma.veiculo.create({
      data: PrismaVeiculoMapper.toPersistence(veiculo),
    });
    return PrismaVeiculoMapper.toDomain(raw);
  }

  async atualizar(id: string, veiculo: Veiculo): Promise<Veiculo> {
    const raw = await this.prisma.veiculo.update({
      where: { id },
      data: PrismaVeiculoMapper.toPersistence(veiculo),
    });
    return PrismaVeiculoMapper.toDomain(raw);
  }

  async remover(id: string): Promise<void> {
    await this.prisma.veiculo.delete({ where: { id } });
  }
}
