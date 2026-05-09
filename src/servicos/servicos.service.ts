import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateServicoDto } from './dto/create-servico.dto';
import { UpdateServicoDto } from './dto/update-servico.dto';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class ServicosService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createServicoDto: CreateServicoDto) {
    const nomeJaExiste = await this.prismaService.servico.findUnique({
      where: { nome: createServicoDto.nome },
    });

    if (nomeJaExiste) {
      throw new ConflictException('Já existe um serviço com esse nome.');
    }

    const servico = await this.prismaService.servico.create({
      data: {
        nome: createServicoDto.nome,
        descricao: createServicoDto.descricao,
        precoBase: createServicoDto.precoBase,
        tempoEstimadoMin: createServicoDto.tempoEstimadoMin,
        ativo: createServicoDto.ativo ?? true,
      },
    });

    return this.mapServico(servico);
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? { nome: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [servicos, total] = await Promise.all([
      this.prismaService.servico.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip,
        take: limit,
      }),
      this.prismaService.servico.count({ where }),
    ]);

    return {
      data: servicos.map(this.mapServico),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const servico = await this.prismaService.servico.findUnique({
      where: { id },
    });

    if (!servico) {
      throw new NotFoundException(`Serviço com id "${id}" não encontrado.`);
    }

    return this.mapServico(servico);
  }

  async update(id: string, updateServicoDto: UpdateServicoDto) {
    await this.findOne(id);

    if (updateServicoDto.nome) {
      const conflito = await this.prismaService.servico.findFirst({
        where: {
          AND: [{ id: { not: id } }, { nome: updateServicoDto.nome }],
        },
      });

      if (conflito) {
        throw new ConflictException('Já existe um serviço com esse nome.');
      }
    }

    const servico = await this.prismaService.servico.update({
      where: { id },
      data: updateServicoDto,
    });

    return this.mapServico(servico);
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prismaService.servico.delete({ where: { id } });

    return { message: `Serviço "${id}" removido com sucesso.` };
  }

  private mapServico(servico: {
    id: string;
    nome: string;
    descricao: string | null;
    precoBase: unknown;
    tempoEstimadoMin: number;
    ativo: boolean;
  }) {
    return {
      id: servico.id,
      nome: servico.nome,
      descricao: servico.descricao,
      precoBase: Number(servico.precoBase),
      tempoEstimadoMin: servico.tempoEstimadoMin,
      ativo: servico.ativo,
    };
  }
}
