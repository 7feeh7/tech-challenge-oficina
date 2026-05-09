import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePecaDto } from './dto/create-peca.dto';
import { UpdatePecaDto } from './dto/update-peca.dto';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class PecasService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createPecaDto: CreatePecaDto) {
    const codigoJaExiste = await this.prismaService.peca.findUnique({
      where: { codigo: createPecaDto.codigo },
    });

    if (codigoJaExiste) {
      throw new ConflictException('Já existe uma peça com esse código.');
    }

    const peca = await this.prismaService.peca.create({
      data: {
        codigo: createPecaDto.codigo,
        nome: createPecaDto.nome,
        descricao: createPecaDto.descricao,
        precoUnitario: createPecaDto.precoUnitario,
        quantidadeEstoque: createPecaDto.quantidadeEstoque ?? 0,
        estoqueMinimo: createPecaDto.estoqueMinimo ?? 0,
        ativo: createPecaDto.ativo ?? true,
      },
    });

    return this.mapPeca(peca);
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { nome: { contains: search, mode: 'insensitive' as const } },
            { codigo: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [pecas, total] = await Promise.all([
      this.prismaService.peca.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip,
        take: limit,
      }),
      this.prismaService.peca.count({ where }),
    ]);

    return {
      data: pecas.map(this.mapPeca),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const peca = await this.prismaService.peca.findUnique({
      where: { id },
    });

    if (!peca) {
      throw new NotFoundException(`Peça com id "${id}" não encontrada.`);
    }

    return this.mapPeca(peca);
  }

  async update(id: string, updatePecaDto: UpdatePecaDto) {
    await this.findOne(id);

    if (updatePecaDto.codigo) {
      const conflito = await this.prismaService.peca.findFirst({
        where: {
          AND: [{ id: { not: id } }, { codigo: updatePecaDto.codigo }],
        },
      });

      if (conflito) {
        throw new ConflictException('Já existe uma peça com esse código.');
      }
    }

    const peca = await this.prismaService.peca.update({
      where: { id },
      data: updatePecaDto,
    });

    return this.mapPeca(peca);
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prismaService.peca.delete({ where: { id } });

    return { message: `Peça "${id}" removida com sucesso.` };
  }

  private mapPeca(peca: {
    id: string;
    codigo: string;
    nome: string;
    descricao: string | null;
    precoUnitario: unknown;
    quantidadeEstoque: number;
    estoqueMinimo: number;
    ativo: boolean;
  }) {
    return {
      id: peca.id,
      codigo: peca.codigo,
      nome: peca.nome,
      descricao: peca.descricao,
      precoUnitario: Number(peca.precoUnitario),
      quantidadeEstoque: peca.quantidadeEstoque,
      estoqueMinimo: peca.estoqueMinimo,
      ativo: peca.ativo,
    };
  }
}
