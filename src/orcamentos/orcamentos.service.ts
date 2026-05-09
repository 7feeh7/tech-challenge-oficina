import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { StatusOrcamento } from '@/generated/prisma/enums';

@Injectable()
export class OrcamentosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrcamentoDto) {
    const ordem = await this.prisma.ordemServico.findUnique({ where: { id: dto.ordemServicoId } });
    if (!ordem) throw new NotFoundException(`Ordem de serviço "${dto.ordemServicoId}" não encontrada.`);

    const orcamento = await this.prisma.orcamento.create({
      data: {
        ordemServicoId: dto.ordemServicoId,
        valorTotal: dto.valorTotal,
        observacoes: dto.observacoes,
      },
    });

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
    if (!orcamento) throw new NotFoundException(`Orçamento "${id}" não encontrado.`);
    return this.mapOrcamento(orcamento);
  }

  async update(id: string, dto: UpdateOrcamentoDto) {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { id } });
    if (!orcamento) throw new NotFoundException(`Orçamento "${id}" não encontrado.`);

    if (dto.status === StatusOrcamento.REJEITADO && !dto.motivoRejeicao) {
      throw new BadRequestException('Informe o motivo da rejeição.');
    }

    const updated = await this.prisma.orcamento.update({
      where: { id },
      data: {
        valorTotal: dto.valorTotal,
        observacoes: dto.observacoes,
        status: dto.status,
        motivoRejeicao: dto.motivoRejeicao,
        aprovadoEm: dto.status === StatusOrcamento.APROVADO && !orcamento.aprovadoEm ? new Date() : undefined,
        rejeitadoEm: dto.status === StatusOrcamento.REJEITADO && !orcamento.rejeitadoEm ? new Date() : undefined,
      },
    });

    return this.mapOrcamento(updated);
  }

  async remove(id: string) {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { id } });
    if (!orcamento) throw new NotFoundException(`Orçamento "${id}" não encontrado.`);
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
