import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import {
  ClienteComVeiculos,
  ClienteGateway,
  DocumentoDeContato,
  PaginaClientes,
} from '../../application/ports/cliente.gateway';
import { Cliente } from '../../domain/entities/cliente.entity';
import { PrismaClienteMapper } from './prisma-cliente.mapper';

@Injectable()
export class PrismaClienteGateway implements ClienteGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Cliente | null> {
    const raw = await this.prisma.cliente.findUnique({ where: { id } });
    return raw ? PrismaClienteMapper.toDomain(raw) : null;
  }

  async buscarComVeiculosPorId(id: string): Promise<ClienteComVeiculos | null> {
    const raw = await this.prisma.cliente.findUnique({
      where: { id },
      include: { veiculos: true },
    });
    if (!raw) return null;

    const { veiculos, ...cliente } = raw;

    return {
      cliente: PrismaClienteMapper.toDomain(cliente),
      veiculos: veiculos.map(({ id, placa, marca, modelo, ano }) => ({
        id,
        placa,
        marca,
        modelo,
        ano,
      })),
    };
  }

  async existeComEmailOuDocumento(
    email: string,
    cpfCnpj: string,
  ): Promise<boolean> {
    const raw = await this.prisma.cliente.findFirst({
      where: { OR: [{ email }, { cpfCnpj }] },
      select: { id: true },
    });
    return raw !== null;
  }

  async contatoPertenceAOutroCliente(
    id: string,
    contato: DocumentoDeContato,
  ): Promise<boolean> {
    const alternativas = [
      ...(contato.email ? [{ email: contato.email }] : []),
      ...(contato.cpfCnpj ? [{ cpfCnpj: contato.cpfCnpj }] : []),
    ];
    if (alternativas.length === 0) return false;

    const raw = await this.prisma.cliente.findFirst({
      where: { AND: [{ id: { not: id } }, { OR: alternativas }] },
      select: { id: true },
    });
    return raw !== null;
  }

  async listar(
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginaClientes> {
    const where = search
      ? { nome: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [raw, total] = await Promise.all([
      this.prisma.cliente.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return { clientes: raw.map(PrismaClienteMapper.toDomain), total };
  }

  async criar(cliente: Cliente): Promise<Cliente> {
    const raw = await this.prisma.cliente.create({
      data: PrismaClienteMapper.toPersistence(cliente),
    });
    return PrismaClienteMapper.toDomain(raw);
  }

  async atualizar(id: string, cliente: Cliente): Promise<Cliente> {
    const raw = await this.prisma.cliente.update({
      where: { id },
      data: PrismaClienteMapper.toPersistence(cliente),
    });
    return PrismaClienteMapper.toDomain(raw);
  }

  async remover(id: string): Promise<void> {
    await this.prisma.cliente.delete({ where: { id } });
  }
}
