import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { PrismaService } from '@/database/prisma.service';
import { PerfilUsuario } from '@/generated/prisma/enums';

@Injectable()
export class UsuariosService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createUsuarioDto: CreateUsuarioDto) {
    const emailJaExiste = await this.prismaService.usuario.findUnique({
      where: { email: createUsuarioDto.email },
    });

    if (emailJaExiste) {
      throw new ConflictException('Já existe um usuário com esse e-mail.');
    }

    const senhaHash = await bcrypt.hash(createUsuarioDto.senha, 10);

    const usuario = await this.prismaService.usuario.create({
      data: {
        nome: createUsuarioDto.nome,
        email: createUsuarioDto.email,
        senhaHash,
        perfil: createUsuarioDto.perfil,
      },
    });

    return this.mapUsuario(usuario);
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? { nome: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [usuarios, total] = await Promise.all([
      this.prismaService.usuario.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit,
      }),
      this.prismaService.usuario.count({ where }),
    ]);

    return {
      data: usuarios.map(this.mapUsuario),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const usuario = await this.prismaService.usuario.findUnique({
      where: { id },
    });

    if (!usuario) {
      throw new NotFoundException(`Usuário com id "${id}" não encontrado.`);
    }

    return this.mapUsuario(usuario);
  }

  async update(id: string, updateUsuarioDto: UpdateUsuarioDto) {
    await this.findOne(id);

    if (updateUsuarioDto.email) {
      const conflito = await this.prismaService.usuario.findFirst({
        where: {
          AND: [{ id: { not: id } }, { email: updateUsuarioDto.email }],
        },
      });

      if (conflito) {
        throw new ConflictException('E-mail já está em uso por outro usuário.');
      }
    }

    const data: {
      nome?: string;
      email?: string;
      senhaHash?: string;
      perfil?: PerfilUsuario;
      ativo?: boolean;
    } = {};

    if (updateUsuarioDto.nome) data.nome = updateUsuarioDto.nome;
    if (updateUsuarioDto.email) data.email = updateUsuarioDto.email;
    if (updateUsuarioDto.perfil) data.perfil = updateUsuarioDto.perfil;
    if (updateUsuarioDto.senha) {
      data.senhaHash = await bcrypt.hash(updateUsuarioDto.senha, 10);
    }

    const usuario = await this.prismaService.usuario.update({
      where: { id },
      data,
    });

    return this.mapUsuario(usuario);
  }

  async findByEmailParaAuth(email: string) {
    return this.prismaService.usuario.findUnique({
      where: { email },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prismaService.usuario.delete({ where: { id } });

    return { message: `Usuário "${id}" removido com sucesso.` };
  }

  private mapUsuario(usuario: {
    id: string;
    nome: string;
    email: string;
    perfil: PerfilUsuario;
    ativo: boolean;
  }) {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
    };
  }
}
