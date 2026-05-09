import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { StatusOS } from '@/generated/prisma/enums';

@Injectable()
export class OrdensServicoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrdemServicoDto) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new NotFoundException(`Cliente "${dto.clienteId}" não encontrado.`);

    const veiculo = await this.prisma.veiculo.findUnique({ where: { id: dto.veiculoId } });
    if (!veiculo) throw new NotFoundException(`Veículo "${dto.veiculoId}" não encontrado.`);

    if (veiculo.clienteId !== dto.clienteId)
      throw new BadRequestException('O veículo não pertence ao cliente informado.');

    // Resolve preços snapshot dos serviços
    const servicosData = await Promise.all(
      (dto.servicos ?? []).map(async (item) => {
        const servico = await this.prisma.servico.findUnique({ where: { id: item.servicoId } });
        if (!servico) throw new NotFoundException(`Serviço "${item.servicoId}" não encontrado.`);
        return {
          servicoId: item.servicoId,
          quantidade: item.quantidade ?? 1,
          precoUnitario: servico.precoBase,
        };
      }),
    );

    // Resolve preços snapshot das peças
    const pecasData = await Promise.all(
      (dto.pecas ?? []).map(async (item) => {
        const peca = await this.prisma.peca.findUnique({ where: { id: item.pecaId } });
        if (!peca) throw new NotFoundException(`Peça "${item.pecaId}" não encontrada.`);
        return {
          pecaId: item.pecaId,
          quantidade: item.quantidade,
          precoUnitario: peca.precoUnitario,
        };
      }),
    );

    const ordem = await this.prisma.ordemServico.create({
      data: {
        clienteId: dto.clienteId,
        veiculoId: dto.veiculoId,
        descricaoProblema: dto.descricaoProblema,
        diagnostico: dto.diagnostico,
        servicos: servicosData.length
          ? { create: servicosData }
          : undefined,
        pecas: pecasData.length
          ? { create: pecasData }
          : undefined,
      },
      include: {
        cliente: { select: { id: true, nome: true } },
        veiculo: { select: { id: true, placa: true, modelo: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } },
        pecas: { include: { peca: { select: { id: true, codigo: true, nome: true } } } },
      },
    });

    return this.mapOrdem(ordem);
  }

  async findAll(page = 1, limit = 10, status?: string) {
    const skip = (page - 1) * limit;
    const where = status ? { status: status as StatusOS } : {};

    const [data, total] = await Promise.all([
      this.prisma.ordemServico.findMany({
        where,
        skip,
        take: limit,
        orderBy: { criadoEm: 'desc' },
        include: {
          cliente: { select: { id: true, nome: true } },
          veiculo: { select: { id: true, placa: true, modelo: true } },
        },
      }),
      this.prisma.ordemServico.count({ where }),
    ]);

    return {
      data: data.map((o) => this.mapOrdemSimples(o)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const ordem = await this.prisma.ordemServico.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true, email: true, telefone: true } },
        veiculo: { select: { id: true, placa: true, marca: true, modelo: true, ano: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } },
        pecas: { include: { peca: { select: { id: true, codigo: true, nome: true } } } },
        orcamentos: true,
        historicoStatus: { orderBy: { criadoEm: 'asc' } },
      },
    });

    if (!ordem) throw new NotFoundException(`Ordem de serviço "${id}" não encontrada.`);
    return this.mapOrdem(ordem);
  }

  async update(id: string, dto: UpdateOrdemServicoDto) {
    const ordem = await this.prisma.ordemServico.findUnique({ where: { id } });
    if (!ordem) throw new NotFoundException(`Ordem de serviço "${id}" não encontrada.`);

    const updated = await this.prisma.ordemServico.update({
      where: { id },
      data: {
        status: dto.status,
        descricaoProblema: dto.descricaoProblema,
        diagnostico: dto.diagnostico,
        iniciadaEm:
          dto.status === StatusOS.EM_EXECUCAO && !ordem.iniciadaEm ? new Date() : undefined,
        finalizadaEm:
          dto.status === StatusOS.FINALIZADA && !ordem.finalizadaEm ? new Date() : undefined,
        entregueEm:
          dto.status === StatusOS.ENTREGUE && !ordem.entregueEm ? new Date() : undefined,
      },
      include: {
        cliente: { select: { id: true, nome: true } },
        veiculo: { select: { id: true, placa: true, modelo: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } },
        pecas: { include: { peca: { select: { id: true, codigo: true, nome: true } } } },
      },
    });

    if (dto.status && dto.status !== ordem.status) {
      await this.prisma.historicoStatusOS.create({
        data: {
          ordemServicoId: id,
          statusAnterior: ordem.status,
          statusNovo: dto.status,
        },
      });
    }

    return this.mapOrdem(updated);
  }

  async remove(id: string) {
    const ordem = await this.prisma.ordemServico.findUnique({ where: { id } });
    if (!ordem) throw new NotFoundException(`Ordem de serviço "${id}" não encontrada.`);
    await this.prisma.ordemServico.delete({ where: { id } });
    return { message: `Ordem de serviço "${id}" removida com sucesso.` };
  }

  private mapOrdem(ordem: any) {
    return {
      id: ordem.id,
      numero: ordem.numero,
      status: ordem.status,
      cliente: ordem.cliente,
      veiculo: ordem.veiculo,
      descricaoProblema: ordem.descricaoProblema,
      diagnostico: ordem.diagnostico,
      servicos: (ordem.servicos ?? []).map((s: any) => ({
        id: s.id,
        servico: s.servico,
        quantidade: s.quantidade,
        precoUnitario: Number(s.precoUnitario),
      })),
      pecas: (ordem.pecas ?? []).map((p: any) => ({
        id: p.id,
        peca: p.peca,
        quantidade: p.quantidade,
        precoUnitario: Number(p.precoUnitario),
      })),
      orcamentos: ordem.orcamentos ?? [],
      historicoStatus: ordem.historicoStatus ?? [],
      iniciadaEm: ordem.iniciadaEm,
      finalizadaEm: ordem.finalizadaEm,
      entregueEm: ordem.entregueEm,
      criadoEm: ordem.criadoEm,
      atualizadoEm: ordem.atualizadoEm,
    };
  }

  private mapOrdemSimples(ordem: any) {
    return {
      id: ordem.id,
      numero: ordem.numero,
      status: ordem.status,
      cliente: ordem.cliente,
      veiculo: ordem.veiculo,
      descricaoProblema: ordem.descricaoProblema,
      criadoEm: ordem.criadoEm,
      atualizadoEm: ordem.atualizadoEm,
    };
  }
}
