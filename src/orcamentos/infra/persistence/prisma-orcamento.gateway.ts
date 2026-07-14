import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import {
  StatusOrcamento as StatusOrcamentoPrisma,
  StatusOS as StatusOSPrisma,
  TipoMovimentacaoEstoque,
} from '@/generated/prisma/enums';
import { OrdemServico } from '@/ordens-servico/domain/entities/ordem-servico.entity';
import { StatusOS } from '@/ordens-servico/domain/status-os';
import {
  BaixaDeEstoque,
  OrcamentoGateway,
  OrdemDoOrcamento,
  PaginaOrcamentos,
  ResultadoDaDecisao,
  TransicaoDaOrdem,
} from '../../application/ports/orcamento.gateway';
import { Orcamento } from '../../domain/entities/orcamento.entity';
import { PrismaOrcamentoMapper } from './prisma-orcamento.mapper';

@Injectable()
export class PrismaOrcamentoGateway implements OrcamentoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Orcamento | null> {
    const raw = await this.prisma.orcamento.findUnique({ where: { id } });
    return raw ? PrismaOrcamentoMapper.toDomain(raw) : null;
  }

  async listar(
    page: number,
    limit: number,
    ordemServicoId?: string,
  ): Promise<PaginaOrcamentos> {
    const where = ordemServicoId ? { ordemServicoId } : {};

    const [raw, total] = await Promise.all([
      this.prisma.orcamento.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.orcamento.count({ where }),
    ]);

    return { orcamentos: raw.map(PrismaOrcamentoMapper.toDomain), total };
  }

  async buscarOrdemComPecas(
    ordemServicoId: string,
  ): Promise<OrdemDoOrcamento | null> {
    const ordem = await this.prisma.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: {
        id: true,
        pecas: {
          select: {
            pecaId: true,
            quantidade: true,
            peca: { select: { quantidadeEstoque: true } },
          },
        },
      },
    });
    if (!ordem) return null;

    return {
      id: ordem.id,
      pecas: ordem.pecas.map((item) => ({
        pecaId: item.pecaId,
        quantidade: item.quantidade,
        saldoDisponivel: item.peca.quantidadeEstoque,
      })),
    };
  }

  async existeOrcamentoAguardandoAprovacao(
    ordemServicoId: string,
  ): Promise<boolean> {
    const raw = await this.prisma.orcamento.findFirst({
      where: {
        ordemServicoId,
        status: StatusOrcamentoPrisma.AGUARDANDO_APROVACAO,
      },
      select: { id: true },
    });
    return raw !== null;
  }

  /** Orçamento criado e OS movida para AGUARDANDO_APROVACAO na mesma transação. */
  async criarEEnviarParaAprovacao(
    orcamento: Orcamento,
  ): Promise<ResultadoDaDecisao> {
    return await this.prisma.$transaction(async (tx) => {
      const criado = await tx.orcamento.create({
        data: PrismaOrcamentoMapper.toPersistence(orcamento),
      });

      const transicao = await this.moverOrdem(tx, orcamento.ordemServicoId, {
        statusNovo: StatusOS.AGUARDANDO_APROVACAO,
        observacao: 'Orçamento gerado',
      });

      return { orcamento: PrismaOrcamentoMapper.toDomain(criado), transicao };
    });
  }

  async atualizar(id: string, orcamento: Orcamento): Promise<Orcamento> {
    const raw = await this.prisma.orcamento.update({
      where: { id },
      data: PrismaOrcamentoMapper.toPersistence(orcamento),
    });
    return PrismaOrcamentoMapper.toDomain(raw);
  }

  /**
   * Recusa do cliente: grava o orçamento como rejeitado e devolve a OS ao
   * diagnóstico, na mesma transação, para que a proposta seja revista.
   *
   * A OS só é movida se ainda estiver aguardando aprovação — se ela já seguiu
   * outro caminho, rejeitar um orçamento antigo não deve puxá-la de volta.
   */
  async rejeitarEDevolverParaDiagnostico(
    orcamento: Orcamento,
  ): Promise<ResultadoDaDecisao> {
    return await this.prisma.$transaction(async (tx) => {
      const rejeitado = await tx.orcamento.update({
        where: { id: orcamento.id },
        data: PrismaOrcamentoMapper.toPersistence(orcamento),
      });

      const transicao = await this.moverOrdem(tx, orcamento.ordemServicoId, {
        statusNovo: StatusOS.EM_DIAGNOSTICO,
        observacao: 'Orçamento recusado pelo cliente',
        somenteSeEstiverEm: StatusOS.AGUARDANDO_APROVACAO,
      });

      return {
        orcamento: PrismaOrcamentoMapper.toDomain(rejeitado),
        transicao,
      };
    });
  }

  /**
   * Aprovação: grava o orçamento, põe a OS EM_EXECUCAO, registra o histórico e
   * baixa o estoque de cada peça — tudo na mesma transação. Se qualquer passo
   * falhar, nenhuma baixa é aplicada.
   */
  async aprovarComBaixaDeEstoque(
    orcamento: Orcamento,
    baixas: BaixaDeEstoque[],
  ): Promise<ResultadoDaDecisao> {
    return await this.prisma.$transaction(async (tx) => {
      const aprovado = await tx.orcamento.update({
        where: { id: orcamento.id },
        data: PrismaOrcamentoMapper.toPersistence(orcamento),
      });

      // A entidade carimba `iniciadaEm` ao entrar em execução — não é preciso
      // (nem correto) o adaptador cuidar disso.
      const transicao = await this.moverOrdem(tx, orcamento.ordemServicoId, {
        statusNovo: StatusOS.EM_EXECUCAO,
        observacao: 'Orçamento aprovado',
      });

      for (const baixa of baixas) {
        await tx.movimentacaoEstoque.create({
          data: {
            pecaId: baixa.pecaId,
            tipo: TipoMovimentacaoEstoque.BAIXA,
            quantidade: baixa.quantidade,
            ordemServicoId: orcamento.ordemServicoId,
            observacao: 'Baixa automática por aprovação de orçamento',
          },
        });

        await tx.peca.update({
          where: { id: baixa.pecaId },
          data: { quantidadeEstoque: baixa.novoSaldo },
        });
      }

      return { orcamento: PrismaOrcamentoMapper.toDomain(aprovado), transicao };
    });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.orcamento.delete({ where: { id } });
  }

  /**
   * Move a OS pela MESMA máquina de estados do módulo de ordens de serviço:
   * carrega a entidade e chama `alterarStatus`, que recusa transições inválidas
   * (`TransicaoStatusInvalidaError` → 400) e carimba os marcos de tempo.
   *
   * Como isso roda dentro da transação, uma transição inválida desfaz também a
   * escrita do orçamento — não sobra orçamento aprovado com a OS parada.
   *
   * Devolve a transição que aconteceu (é o que o caso de uso usa para avisar o
   * cliente) ou `undefined` quando a OS não saiu do lugar.
   */
  private async moverOrdem(
    tx: Prisma.TransactionClient,
    ordemServicoId: string,
    opcoes: {
      statusNovo: StatusOS;
      observacao: string;
      somenteSeEstiverEm?: StatusOS;
    },
  ): Promise<TransicaoDaOrdem | undefined> {
    const raw = await tx.ordemServico.findUniqueOrThrow({
      where: { id: ordemServicoId },
      select: {
        id: true,
        numero: true,
        status: true,
        clienteId: true,
        veiculoId: true,
        iniciadaEm: true,
        finalizadaEm: true,
        entregueEm: true,
        criadoEm: true,
        cliente: { select: { nome: true, email: true } },
      },
    });

    const ordem = new OrdemServico({
      ...raw,
      status: raw.status as unknown as StatusOS,
    });
    const statusAnterior = ordem.status;

    // Recusar um orçamento antigo não deve puxar de volta uma OS que já seguiu
    // adiante — nesse caso não há transição alguma.
    if (
      opcoes.somenteSeEstiverEm !== undefined &&
      statusAnterior !== opcoes.somenteSeEstiverEm
    ) {
      return undefined;
    }

    ordem.alterarStatus(opcoes.statusNovo);

    if (ordem.status === statusAnterior) {
      return undefined;
    }

    await tx.ordemServico.update({
      where: { id: ordemServicoId },
      data: {
        status: paraStatusPrisma(ordem.status),
        iniciadaEm: ordem.iniciadaEm,
        finalizadaEm: ordem.finalizadaEm,
        entregueEm: ordem.entregueEm,
      },
    });

    await tx.historicoStatusOS.create({
      data: {
        ordemServicoId,
        statusAnterior: paraStatusPrisma(statusAnterior),
        statusNovo: paraStatusPrisma(ordem.status),
        observacao: opcoes.observacao,
      },
    });

    return {
      numeroOS: ordem.numero,
      cliente: raw.cliente,
      statusAnterior,
      statusNovo: ordem.status,
    };
  }
}

/** Os dois enums têm os mesmos valores; só o tipo é diferente. */
function paraStatusPrisma(status: StatusOS): StatusOSPrisma {
  return status;
}
