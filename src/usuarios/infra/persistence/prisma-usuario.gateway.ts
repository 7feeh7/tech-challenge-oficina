import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { Usuario } from '../../entities/usuario.entity';
import { UsuarioGateway } from '../../application/ports/usuario.gateway';
import { PrismaUsuarioMapper } from './prisma-usuario.mapper';

@Injectable()
export class PrismaUsuarioGateway implements UsuarioGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string) {
    const raw = await this.prisma.usuario.findUnique({ where: { id } });
    return raw ? PrismaUsuarioMapper.toDomain(raw) : null;
  }

  async buscarPorEmail(email: string) {
    const raw = await this.prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return raw ? PrismaUsuarioMapper.toDomain(raw) : null;
  }

  async emailPertenceAOutroUsuario(email: string, id: string) {
    return !!(await this.prisma.usuario.findFirst({
      where: {
        AND: [{ id: { not: id } }, { email: email.trim().toLowerCase() }],
      },
    }));
  }

  async listar(page: number, limit: number, search?: string) {
    const where = search
      ? { nome: { contains: search, mode: 'insensitive' as const } }
      : {};
    const [raw, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.usuario.count({ where }),
    ]);
    return { usuarios: raw.map(PrismaUsuarioMapper.toDomain), total };
  }

  async criar(usuario: Usuario) {
    const raw = await this.prisma.usuario.create({
      data: PrismaUsuarioMapper.toPersistence(usuario),
    });
    return PrismaUsuarioMapper.toDomain(raw);
  }

  async atualizar(id: string, usuario: Usuario) {
    const raw = await this.prisma.usuario.update({
      where: { id },
      data: PrismaUsuarioMapper.toPersistence(usuario),
    });
    return PrismaUsuarioMapper.toDomain(raw);
  }

  async remover(id: string) {
    await this.prisma.usuario.delete({
      where: { id },
    });
  }
}
