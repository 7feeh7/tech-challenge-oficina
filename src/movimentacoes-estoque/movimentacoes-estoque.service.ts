import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateMovimentacaoEstoqueDto } from './dto/create-movimentacao-estoque.dto';
import { TipoMovimentacaoEstoque } from '@/generated/prisma/enums';

@Injectable()
export class MovimentacoesEstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMovimentacaoEstoqueDto) {
    const peca = await this.prisma.peca.findUnique({
      where: { id: dto.pecaId },
    });
    if (!peca)
      throw new NotFoundException(`Peça "${dto.pecaId}" não encontrada.`);

    if (dto.tipo === TipoMovimentacaoEstoque.BAIXA) {
      if (peca.quantidadeEstoque < dto.quantidade) {
        throw new BadRequestException(
          `Estoque insuficiente. Disponível: ${peca.quantidadeEstoque}, solicitado: ${dto.quantidade}.`,
        );
      }
    }

    const [movimentacao] = await this.prisma.$transaction([
      this.prisma.movimentacaoEstoque.create({
        data: {
          pecaId: dto.pecaId,
          tipo: dto.tipo,
          quantidade: dto.quantidade,
          ordemServicoId: dto.ordemServicoId,
          observacao: dto.observacao,
        },
      }),
      this.prisma.peca.update({
        where: { id: dto.pecaId },
        data: {
          quantidadeEstoque:
            dto.tipo === TipoMovimentacaoEstoque.ENTRADA
              ? { increment: dto.quantidade }
              : { decrement: dto.quantidade },
        },
      }),
    ]);

    return this.mapMovimentacao(movimentacao);
  }

  async findAll(page = 1, limit = 10, pecaId?: string) {
    const skip = (page - 1) * limit;
    const where = pecaId ? { pecaId } : {};

    const [data, total] = await Promise.all([
      this.prisma.movimentacaoEstoque.findMany({
        where,
        skip,
        take: limit,
        orderBy: { criadoEm: 'desc' },
        include: { peca: { select: { id: true, codigo: true, nome: true } } },
      }),
      this.prisma.movimentacaoEstoque.count({ where }),
    ]);

    return {
      data: data.map((m) => this.mapMovimentacao(m)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const mov = await this.prisma.movimentacaoEstoque.findUnique({
      where: { id },
      include: { peca: { select: { id: true, codigo: true, nome: true } } },
    });
    if (!mov)
      throw new NotFoundException(
        `Movimentação de estoque "${id}" não encontrada.`,
      );
    return this.mapMovimentacao(mov);
  }

  private mapMovimentacao(m: any) {
    return {
      id: m.id,
      pecaId: m.pecaId,
      peca: m.peca,
      tipo: m.tipo,
      quantidade: m.quantidade,
      ordemServicoId: m.ordemServicoId,
      observacao: m.observacao,
      criadoEm: m.criadoEm,
    };
  }
}
