import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  ClienteDaOrdem,
  MarcosDeTempo,
  OrdemServicoDetalhe,
  OrdemServicoGateway,
  PaginaOrdensServico,
  RegistroDeStatus,
  VeiculoDaOrdem,
} from '../../application/ports/ordem-servico.gateway';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import { STATUS_ENCERRADOS, StatusOS } from '../../domain/status-os';
import {
  ItemPecaPrisma,
  ItemServicoPrisma,
  OrdemServicoPrisma,
  PrismaOrdemServicoMapper,
} from './prisma-ordem-servico.mapper';

/** OS crua do Prisma já com cliente, veículo e itens resolvidos pelo include. */
type OrdemServicoComRelacoes = Omit<
  OrdemServicoPrisma,
  'servicos' | 'pecas'
> & {
  cliente: ClienteDaOrdem;
  veiculo: VeiculoDaOrdem;
  servicos: (ItemServicoPrisma & { servico: { id: string; nome: string } })[];
  pecas: (ItemPecaPrisma & {
    peca: { id: string; codigo: string; nome: string };
  })[];
};

const INCLUDE_DETALHE = {
  cliente: { select: { id: true, nome: true, email: true, telefone: true } },
  veiculo: {
    select: { id: true, placa: true, marca: true, modelo: true, ano: true },
  },
  servicos: { include: { servico: { select: { id: true, nome: true } } } },
  pecas: {
    include: { peca: { select: { id: true, codigo: true, nome: true } } },
  },
} as const;

@Injectable()
export class PrismaOrdemServicoGateway implements OrdemServicoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<OrdemServico | null> {
    const raw = await this.prisma.ordemServico.findUnique({
      where: { id },
      include: { servicos: true, pecas: true },
    });
    return raw ? PrismaOrdemServicoMapper.toDomain(raw) : null;
  }

  async buscarDetalhePorId(id: string): Promise<OrdemServicoDetalhe | null> {
    const raw = await this.prisma.ordemServico.findUnique({
      where: { id },
      include: {
        ...INCLUDE_DETALHE,
        orcamentos: true,
        historicoStatus: { orderBy: { criadoEm: 'asc' } },
      },
    });
    if (!raw) return null;

    return {
      ...this.montarDetalhe(raw),
      orcamentos: raw.orcamentos,
      historicoStatus: raw.historicoStatus,
    };
  }

  /**
   * Fila de trabalho: sem as OS encerradas, priorizando Em Execução >
   * Aguardando Aprovação > Diagnóstico > Recebida e, dentro de cada status,
   * as mais antigas primeiro.
   *
   * O Postgres ordena enums pela ordem de DECLARAÇÃO no schema, que aqui é a
   * cronológica (RECEBIDA → … → ENTREGUE). Invertê-la (`desc`) produz
   * exatamente a prioridade da fila. O spec de `status-os` trava essa ordem de
   * declaração para que ninguém a mude sem perceber que a listagem depende dela.
   */
  async listar(
    page: number,
    limit: number,
    status?: StatusOS,
  ): Promise<PaginaOrdensServico> {
    const where = status
      ? { status: PrismaOrdemServicoMapper.toStatusPrisma(status) }
      : {
          status: {
            notIn: STATUS_ENCERRADOS.map(
              PrismaOrdemServicoMapper.toStatusPrisma,
            ),
          },
        };

    const [raw, total] = await Promise.all([
      this.prisma.ordemServico.findMany({
        where,
        orderBy: [{ status: 'desc' }, { criadoEm: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          cliente: { select: { id: true, nome: true } },
          veiculo: { select: { id: true, placa: true, modelo: true } },
        },
      }),
      this.prisma.ordemServico.count({ where }),
    ]);

    return {
      ordens: raw.map(({ cliente, veiculo, ...ordem }) => ({
        ordem: PrismaOrdemServicoMapper.toDomain(ordem),
        cliente,
        veiculo,
      })),
      total,
    };
  }

  /** OS, itens e primeira entrada do histórico na mesma transação. */
  async criar(
    ordem: OrdemServico,
    registro: RegistroDeStatus,
  ): Promise<OrdemServicoDetalhe> {
    const raw = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.ordemServico.create({
        data: {
          clienteId: ordem.clienteId,
          veiculoId: ordem.veiculoId,
          descricaoProblema: ordem.descricaoProblema,
          diagnostico: ordem.diagnostico,
          servicos: { create: this.itensServico(ordem.servicosAdicionados) },
          pecas: { create: this.itensPeca(ordem.pecasAdicionadas) },
        },
        include: INCLUDE_DETALHE,
      });

      await tx.historicoStatusOS.create({
        data: this.dadosDoHistorico(criada.id, registro),
      });

      return criada;
    });

    return this.montarDetalhe(raw);
  }

  /** Atualização, novos itens e histórico da mudança de status na mesma transação. */
  async atualizar(
    id: string,
    ordem: OrdemServico,
    registro?: RegistroDeStatus,
  ): Promise<OrdemServicoDetalhe> {
    const raw = await this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.ordemServico.update({
        where: { id },
        data: {
          status: PrismaOrdemServicoMapper.toStatusPrisma(ordem.status),
          descricaoProblema: ordem.descricaoProblema,
          diagnostico: ordem.diagnostico,
          iniciadaEm: ordem.iniciadaEm,
          finalizadaEm: ordem.finalizadaEm,
          entregueEm: ordem.entregueEm,
          servicos: { create: this.itensServico(ordem.servicosAdicionados) },
          pecas: { create: this.itensPeca(ordem.pecasAdicionadas) },
        },
        include: INCLUDE_DETALHE,
      });

      if (registro) {
        await tx.historicoStatusOS.create({
          data: this.dadosDoHistorico(id, registro),
        });
      }

      return atualizada;
    });

    return this.montarDetalhe(raw);
  }

  async remover(id: string): Promise<void> {
    await this.prisma.ordemServico.delete({ where: { id } });
  }

  async buscarMarcosDeTempo(
    dataInicio?: Date,
    dataFim?: Date,
  ): Promise<MarcosDeTempo[]> {
    const criadoEm =
      dataInicio || dataFim
        ? {
            ...(dataInicio ? { gte: dataInicio } : {}),
            ...(dataFim ? { lte: dataFim } : {}),
          }
        : undefined;

    return await this.prisma.ordemServico.findMany({
      where: criadoEm ? { criadoEm } : {},
      select: {
        criadoEm: true,
        iniciadaEm: true,
        finalizadaEm: true,
        entregueEm: true,
      },
    });
  }

  private itensServico(
    itens: readonly {
      servicoId: string;
      quantidade: number;
      precoUnitario: number;
    }[],
  ) {
    return itens.map((item) => ({
      servicoId: item.servicoId,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    }));
  }

  private itensPeca(
    itens: readonly {
      pecaId: string;
      quantidade: number;
      precoUnitario: number;
    }[],
  ) {
    return itens.map((item) => ({
      pecaId: item.pecaId,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    }));
  }

  private dadosDoHistorico(ordemServicoId: string, registro: RegistroDeStatus) {
    return {
      ordemServicoId,
      statusAnterior: registro.statusAnterior
        ? PrismaOrdemServicoMapper.toStatusPrisma(registro.statusAnterior)
        : null,
      statusNovo: PrismaOrdemServicoMapper.toStatusPrisma(registro.statusNovo),
      observacao: registro.observacao,
    };
  }

  private montarDetalhe(raw: OrdemServicoComRelacoes): OrdemServicoDetalhe {
    const { cliente, veiculo, servicos, pecas, ...ordem } = raw;

    return {
      ordem: PrismaOrdemServicoMapper.toDomain({
        ...ordem,
        servicos,
        pecas,
      }),
      cliente,
      veiculo,
      servicos: servicos.map((item) => ({
        id: item.id,
        servico: item.servico,
        quantidade: item.quantidade,
        precoUnitario: Number(item.precoUnitario),
      })),
      pecas: pecas.map((item) => ({
        id: item.id,
        peca: item.peca,
        quantidade: item.quantidade,
        precoUnitario: Number(item.precoUnitario),
      })),
      orcamentos: [],
      historicoStatus: [],
    };
  }
}
