import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import {
  StatusOrcamento,
  StatusOS,
  TipoMovimentacaoEstoque,
} from '@/generated/prisma/enums';

@Injectable()
export class OrcamentosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrcamentoDto) {
    const ordem = await this.prisma.ordemServico.findUnique({
      where: { id: dto.ordemServicoId },
    });
    if (!ordem)
      throw new NotFoundException(
        `Ordem de serviço "${dto.ordemServicoId}" não encontrada.`,
      );

    // Cria o orçamento, move a OS para AGUARDANDO_APROVACAO
    // e registra histórico de status — tudo em uma transação atômica.
    const [orcamento] = await this.prisma.$transaction([
      this.prisma.orcamento.create({
        data: {
          ordemServicoId: dto.ordemServicoId,
          valorTotal: dto.valorTotal,
          observacoes: dto.observacoes,
        },
      }),
      this.prisma.ordemServico.update({
        where: { id: dto.ordemServicoId },
        data: { status: StatusOS.AGUARDANDO_APROVACAO },
      }),
      this.prisma.historicoStatusOS.create({
        data: {
          ordemServicoId: dto.ordemServicoId,
          statusAnterior: ordem.status,
          statusNovo: StatusOS.AGUARDANDO_APROVACAO,
          observacao: 'Orçamento gerado',
        },
      }),
    ]);

    return this.mapOrcamento(orcamento);
  }

  async findAll(page = 1, limit = 10, ordemServicoId?: string) {
    const skip = (page - 1) * limit;
    const where = ordemServicoId ? { ordemServicoId } : {};

    const [data, total] = await Promise.all([
      this.prisma.orcamento.findMany({
        where,
        skip,
        take: limit,
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.orcamento.count({ where }),
    ]);

    return {
      data: data.map((o) => this.mapOrcamento(o)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { id } });
    if (!orcamento)
      throw new NotFoundException(`Orçamento "${id}" não encontrado.`);
    return this.mapOrcamento(orcamento);
  }

  async update(id: string, dto: UpdateOrcamentoDto) {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { id } });
    if (!orcamento)
      throw new NotFoundException(`Orçamento "${id}" não encontrado.`);

    if (dto.status === StatusOrcamento.REJEITADO && !dto.motivoRejeicao) {
      throw new BadRequestException('Informe o motivo da rejeição.');
    }

    // Aprovação do orçamento dispara: OS → EM_EXECUCAO + baixa automática de estoque
    if (
      dto.status === StatusOrcamento.APROVADO &&
      orcamento.status !== StatusOrcamento.APROVADO
    ) {
      return this.aprovarComBaixaEstoque(orcamento, dto);
    }

    const updated = await this.prisma.orcamento.update({
      where: { id },
      data: {
        valorTotal: dto.valorTotal,
        observacoes: dto.observacoes,
        status: dto.status,
        motivoRejeicao: dto.motivoRejeicao,
        rejeitadoEm:
          dto.status === StatusOrcamento.REJEITADO && !orcamento.rejeitadoEm
            ? new Date()
            : undefined,
      },
    });

    return this.mapOrcamento(updated);
  }

  /**
   * Fluxo de aprovação: atualiza o orçamento, move a OS para EM_EXECUCAO,
   * registra histórico e dá baixa de estoque para todas as peças vinculadas à OS.
   * Tudo executado em uma única transação para garantir atomicidade.
   */
  private async aprovarComBaixaEstoque(
    orcamento: { id: string; ordemServicoId: string },
    dto: UpdateOrcamentoDto,
  ) {
    const ordem = await this.prisma.ordemServico.findUnique({
      where: { id: orcamento.ordemServicoId },
      include: { pecas: true },
    });
    if (!ordem)
      throw new NotFoundException(
        `Ordem de serviço "${orcamento.ordemServicoId}" não encontrada.`,
      );

    // Valida estoque disponível antes de iniciar a transação
    for (const item of ordem.pecas) {
      const peca = await this.prisma.peca.findUnique({
        where: { id: item.pecaId },
      });
      if (!peca || peca.quantidadeEstoque < item.quantidade) {
        throw new BadRequestException(
          `Estoque insuficiente para a peça "${item.pecaId}". Disponível: ${peca?.quantidadeEstoque ?? 0}, solicitado: ${item.quantidade}.`,
        );
      }
    }

    const operacoes: any[] = [
      this.prisma.orcamento.update({
        where: { id: orcamento.id },
        data: {
          valorTotal: dto.valorTotal,
          observacoes: dto.observacoes,
          status: StatusOrcamento.APROVADO,
          aprovadoEm: new Date(),
        },
      }),
      this.prisma.ordemServico.update({
        where: { id: ordem.id },
        data: {
          status: StatusOS.EM_EXECUCAO,
          iniciadaEm: ordem.iniciadaEm ?? new Date(),
        },
      }),
      this.prisma.historicoStatusOS.create({
        data: {
          ordemServicoId: ordem.id,
          statusAnterior: ordem.status,
          statusNovo: StatusOS.EM_EXECUCAO,
          observacao: 'Orçamento aprovado',
        },
      }),
    ];

    for (const item of ordem.pecas) {
      operacoes.push(
        this.prisma.movimentacaoEstoque.create({
          data: {
            pecaId: item.pecaId,
            tipo: TipoMovimentacaoEstoque.BAIXA,
            quantidade: item.quantidade,
            ordemServicoId: ordem.id,
            observacao: 'Baixa automática por aprovação de orçamento',
          },
        }),
      );
      operacoes.push(
        this.prisma.peca.update({
          where: { id: item.pecaId },
          data: { quantidadeEstoque: { decrement: item.quantidade } },
        }),
      );
    }

    const [updatedOrcamento] = await this.prisma.$transaction(operacoes);
    return this.mapOrcamento(updatedOrcamento);
  }

  async remove(id: string) {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { id } });
    if (!orcamento)
      throw new NotFoundException(`Orçamento "${id}" não encontrado.`);
    await this.prisma.orcamento.delete({ where: { id } });
    return { message: `Orçamento "${id}" removido com sucesso.` };
  }

  private mapOrcamento(o: any) {
    return {
      id: o.id,
      ordemServicoId: o.ordemServicoId,
      valorTotal: Number(o.valorTotal),
      status: o.status,
      observacoes: o.observacoes,
      aprovadoEm: o.aprovadoEm,
      rejeitadoEm: o.rejeitadoEm,
      motivoRejeicao: o.motivoRejeicao,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    };
  }
}
