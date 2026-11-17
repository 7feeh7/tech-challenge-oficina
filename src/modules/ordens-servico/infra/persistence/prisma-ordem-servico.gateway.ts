import { Injectable } from '@nestjs/common';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import { STATUS_ENCERRADOS, StatusOS } from '../../domain/status-os';
import {
  HistoricoStatusDetalhe,
  MarcosDeTempo,
  OrdemServicoBloqueada,
  OrdemServicoDetalhe,
  OrdemServicoGateway,
  PaginaOrdensServico,
  RegistroDeStatus,
} from '../../application/ports/ordem-servico.gateway';
import {
  ItemPecaPrisma,
  ItemServicoPrisma,
  OrdemServicoPrisma,
  PrismaOrdemServicoMapper,
} from './prisma-ordem-servico.mapper';

type ItemServicoRelacionado = ItemServicoPrisma & {
  servico: { id: string; nome: string };
};

type ItemPecaRelacionado = ItemPecaPrisma & {
  peca: { id: string; codigo: string; nome: string };
};

type OrdemServicoComRelacoes = OrdemServicoPrisma & {
  cliente: { id: string; nome: string; email: string; telefone?: string };
  veiculo: {
    id: string;
    placa: string;
    modelo: string;
    marca?: string;
    ano?: number;
  };
  servicos: ItemServicoRelacionado[];
  pecas: ItemPecaRelacionado[];
};

const INCLUDE_COMPLETO = {
  cliente: { select: { id: true, nome: true, email: true, telefone: true } },
  veiculo: {
    select: { id: true, placa: true, marca: true, modelo: true, ano: true },
  },
  servicos: { include: { servico: { select: { id: true, nome: true } } } },
  pecas: {
    include: { peca: { select: { id: true, codigo: true, nome: true } } },
  },
  sugestoesItens: true,
} as const;

@Injectable()
export class PrismaOrdemServicoGateway implements OrdemServicoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<OrdemServico | null> {
    const raw = await this.prisma.ordemServico.findUnique({
      where: { id },
      include: { servicos: true, pecas: true, sugestoesItens: true },
    });
    return raw ? PrismaOrdemServicoMapper.toDomain(raw) : null;
  }

  async buscarDetalhePorId(id: string): Promise<OrdemServicoDetalhe | null> {
    const raw = await this.prisma.ordemServico.findUnique({
      where: { id },
      include: {
        ...INCLUDE_COMPLETO,
        orcamentos: true,
        historicoStatus: { orderBy: { criadoEm: 'asc' } },
      },
    });
    if (!raw) return null;

    const historicoStatus: HistoricoStatusDetalhe[] = raw.historicoStatus.map(
      (item) => ({
        id: item.id,
        statusAnterior: item.statusAnterior as StatusOS | null,
        statusNovo: item.statusNovo as StatusOS,
        rodada: item.rodada,
        eventId: item.eventId,
        motivo: item.motivo,
        observacao: item.observacao,
        alteradoPor: item.alteradoPor,
        ocorridoEm: item.ocorridoEm,
        criadoEm: item.criadoEm,
      }),
    );

    return {
      ...this.montarDetalhe(raw),
      orcamentos: raw.orcamentos,
      historicoStatus,
    };
  }

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
        orderBy: [{ prioridadeFila: 'asc' }, { criadoEm: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          cliente: { select: { id: true, nome: true, email: true } },
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

  async criar(
    contexto: ContextoTransacao,
    ordem: OrdemServico,
    registro: RegistroDeStatus,
  ): Promise<OrdemServicoBloqueada> {
    const cliente = obterClienteTransacao(contexto, this.prisma);

    const criada = await cliente.ordemServico.create({
      data: {
        clienteId: ordem.clienteId,
        veiculoId: ordem.veiculoId,
        status: PrismaOrdemServicoMapper.toStatusPrisma(ordem.status),
        rodadaVigente: ordem.rodadaVigente,
        prioridadeFila: ordem.prioridadeFila,
        correlationId: ordem.correlationId,
        descricaoProblema: ordem.descricaoProblema,
        sugestoesItens: {
          create: ordem.sugestoes.map((item) => ({
            tipo: PrismaOrdemServicoMapper.toTipoSugestaoPrisma(item.tipo),
            itemId: item.itemId,
            quantidade: item.quantidade,
          })),
        },
      },
      include: INCLUDE_COMPLETO,
    });

    await cliente.historicoStatusOS.create({
      data: this.dadosHistorico(criada.id, registro),
    });

    return this.paraBloqueada(criada);
  }

  async bloquearParaAtualizacao(
    contexto: ContextoTransacao,
    id: string,
  ): Promise<OrdemServicoBloqueada | null> {
    const cliente = obterClienteTransacao(contexto, this.prisma);

    const bloqueada = await cliente.$queryRaw<{ id: string }[]>`
      SELECT id FROM ordens_servico
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    if (bloqueada.length === 0) {
      return null;
    }

    const raw = await cliente.ordemServico.findUnique({
      where: { id },
      include: INCLUDE_COMPLETO,
    });
    if (!raw) {
      return null;
    }

    return this.paraBloqueada(raw);
  }

  async salvar(
    contexto: ContextoTransacao,
    ordem: OrdemServico,
    registro?: RegistroDeStatus,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const id = ordem.id!;

    await cliente.ordemServico.update({
      where: { id },
      data: {
        status: PrismaOrdemServicoMapper.toStatusPrisma(ordem.status),
        rodadaVigente: ordem.rodadaVigente,
        prioridadeFila: ordem.prioridadeFila,
        descricaoProblema: ordem.descricaoProblema,
        diagnostico: ordem.diagnostico,
        diagnosticoConcluidoEm: ordem.diagnosticoConcluidoEm,
        etapaOrigemCancelamento: ordem.etapaOrigemCancelamento
          ? PrismaOrdemServicoMapper.toStatusPrisma(
              ordem.etapaOrigemCancelamento,
            )
          : null,
        motivoEncerramento: ordem.motivoEncerramento,
        veiculoLiberadoRetirada: ordem.veiculoLiberadoRetirada,
        devolvidaEm: ordem.devolvidaEm,
        prazoReferenciaReserva: ordem.prazoReferenciaReserva,
        iniciadaEm: ordem.iniciadaEm,
        finalizadaEm: ordem.finalizadaEm,
        entregueEm: ordem.entregueEm,
      },
    });

    if (ordem.itensOficiaisSubstituidos) {
      await cliente.ordemServicoServico.deleteMany({
        where: { ordemServicoId: id },
      });
      await cliente.ordemServicoPeca.deleteMany({
        where: { ordemServicoId: id },
      });
      if (ordem.servicos.length > 0) {
        await cliente.ordemServicoServico.createMany({
          data: ordem.servicos.map((item) => ({
            ordemServicoId: id,
            servicoId: item.servicoId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
          })),
        });
      }
      if (ordem.pecas.length > 0) {
        await cliente.ordemServicoPeca.createMany({
          data: ordem.pecas.map((item) => ({
            ordemServicoId: id,
            pecaId: item.pecaId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
          })),
        });
      }
    } else {
      if (ordem.servicosAdicionados.length > 0) {
        await cliente.ordemServicoServico.createMany({
          data: ordem.servicosAdicionados.map((item) => ({
            ordemServicoId: id,
            servicoId: item.servicoId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
          })),
        });
      }
      if (ordem.pecasAdicionadas.length > 0) {
        await cliente.ordemServicoPeca.createMany({
          data: ordem.pecasAdicionadas.map((item) => ({
            ordemServicoId: id,
            pecaId: item.pecaId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
          })),
        });
      }
    }

    if (registro) {
      await cliente.historicoStatusOS.create({
        data: this.dadosHistorico(id, registro),
      });
    }
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

  private dadosHistorico(ordemServicoId: string, registro: RegistroDeStatus) {
    return {
      ordemServicoId,
      statusAnterior: registro.statusAnterior
        ? PrismaOrdemServicoMapper.toStatusPrisma(registro.statusAnterior)
        : null,
      statusNovo: PrismaOrdemServicoMapper.toStatusPrisma(registro.statusNovo),
      rodada: registro.rodada,
      eventId: registro.eventId,
      ocorridoEm: registro.ocorridoEm,
      motivo: registro.motivo,
      observacao: registro.observacao,
      alteradoPor: registro.alteradoPor,
    };
  }

  private paraBloqueada(raw: OrdemServicoComRelacoes): OrdemServicoBloqueada {
    return {
      ordem: PrismaOrdemServicoMapper.toDomain(raw),
      cliente: {
        id: raw.cliente.id,
        nome: raw.cliente.nome,
        email: raw.cliente.email ?? '',
      },
      veiculo: {
        placa: raw.veiculo.placa,
        modelo: raw.veiculo.modelo,
      },
    };
  }

  private montarDetalhe(raw: OrdemServicoComRelacoes): OrdemServicoDetalhe {
    const { cliente, veiculo, servicos, pecas, sugestoesItens, ...ordem } = raw;
    const servicosRel = servicos as ItemServicoRelacionado[];
    const pecasRel = pecas as ItemPecaRelacionado[];

    return {
      ordem: PrismaOrdemServicoMapper.toDomain({
        ...ordem,
        servicos,
        pecas,
        sugestoesItens: sugestoesItens ?? [],
      }),
      cliente,
      veiculo,
      servicos: servicosRel.map((item) => ({
        id: item.id,
        servico: item.servico,
        quantidade: item.quantidade,
        precoUnitario: Number(item.precoUnitario),
      })),
      pecas: pecasRel.map((item) => ({
        id: item.id,
        peca: item.peca,
        quantidade: item.quantidade,
        precoUnitario: Number(item.precoUnitario),
      })),
      sugestoes: (sugestoesItens ?? []).map((item) =>
        PrismaOrdemServicoMapper.sugestaoToDomain(item),
      ),
      orcamentos: [],
      historicoStatus: [],
    };
  }
}
