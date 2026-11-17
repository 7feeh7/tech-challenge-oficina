import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { EstoqueInsuficienteReservaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import { Orcamento } from '../../domain/entities/orcamento.entity';
import {
  EstoqueInsuficienteParaAprovacaoError,
  OrcamentoNaoEncontradoError,
  OrdemDoOrcamentoNaoEncontradaError,
} from '../../domain/errors/orcamento.errors';
import { StatusOrcamento } from '../../domain/status-orcamento';
import {
  OrcamentoOutput,
  OrcamentoOutputMapper,
} from '../mappers/orcamento-output.mapper';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

export interface AtualizarOrcamentoInput {
  valorTotal?: number;
  observacoes?: string;
  status?: StatusOrcamento;
  motivoRejeicao?: string;
}

export class AtualizarOrcamentoUseCase {
  constructor(
    private readonly orcamentos: OrcamentoGateway,
    private readonly unitOfWork: UnitOfWork,
    private readonly transicoes: TransicaoOrdemServicoService,
    private readonly reservarEstoque: ReservarEstoqueUseCase,
  ) {}

  async execute(
    id: string,
    input: AtualizarOrcamentoInput,
  ): Promise<OrcamentoOutput> {
    const orcamento = await this.orcamentos.buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoError(id);
    }

    const aprovandoAgora =
      input.status === StatusOrcamento.APROVADO && !orcamento.estaAprovado();
    const rejeitandoAgora =
      input.status === StatusOrcamento.REJEITADO && !orcamento.estaRejeitado();

    if (input.valorTotal !== undefined) {
      orcamento.alterarValorTotal(input.valorTotal);
    }
    if (input.observacoes !== undefined) {
      orcamento.alterarObservacoes(input.observacoes);
    }
    if (input.status === StatusOrcamento.REJEITADO) {
      orcamento.rejeitar(input.motivoRejeicao);
    }
    if (input.status === StatusOrcamento.APROVADO) {
      orcamento.aprovar();
    }

    if (aprovandoAgora) {
      return OrcamentoOutputMapper.toOutput(
        await this.aprovarComReserva(orcamento),
      );
    }

    if (rejeitandoAgora) {
      return OrcamentoOutputMapper.toOutput(
        await this.rejeitarEDevolver(orcamento),
      );
    }

    return OrcamentoOutputMapper.toOutput(
      await this.unitOfWork.executar((contexto) =>
        this.orcamentos.atualizar(contexto, orcamento),
      ),
    );
  }

  private async rejeitarEDevolver(orcamento: Orcamento): Promise<Orcamento> {
    return await this.unitOfWork.executar(async (contexto) => {
      const atualizado = await this.orcamentos.atualizar(contexto, orcamento);
      await this.transicoes.aplicar(contexto, {
        ordemServicoId: orcamento.ordemServicoId,
        aplicar: (os, ocorridoEm) => {
          if (os.status === StatusOS.AGUARDANDO_APROVACAO) {
            os.registrarOrcamentoRejeitado(ocorridoEm);
          }
        },
        observacao: 'Orçamento recusado pelo cliente',
      });
      return atualizado;
    });
  }

  private async aprovarComReserva(orcamento: Orcamento): Promise<Orcamento> {
    const ordem = await this.orcamentos.buscarOrdemParaOrcamento(
      orcamento.ordemServicoId,
    );
    if (!ordem) {
      throw new OrdemDoOrcamentoNaoEncontradaError(orcamento.ordemServicoId);
    }

    return await this.unitOfWork.executar(async (contexto) => {
      try {
        const reserva = await this.reservarEstoque.execute(
          {
            ordemServicoId: ordem.id,
            rodada: ordem.rodadaVigente,
            itens: ordem.pecas.map((peca) => ({
              pecaId: peca.pecaId,
              quantidade: peca.quantidade,
            })),
            prazoReferencia: null,
          },
          contexto,
        );

        const atualizado = await this.orcamentos.atualizar(contexto, orcamento);
        await this.transicoes.aplicar(contexto, {
          ordemServicoId: orcamento.ordemServicoId,
          aplicar: (os, ocorridoEm) =>
            os.registrarReservaConfirmada(reserva.prazoReferencia, ocorridoEm),
          observacao: 'Orçamento aprovado — reserva confirmada',
        });
        return atualizado;
      } catch (erro) {
        if (erro instanceof EstoqueInsuficienteReservaError) {
          const primeira = erro.itensIndisponiveis[0];
          if (primeira) {
            throw new EstoqueInsuficienteParaAprovacaoError(
              primeira.pecaId,
              primeira.disponivelAtual,
              primeira.solicitado,
            );
          }
          throw new EstoqueInsuficienteParaAprovacaoError('desconhecida', 0, 0);
        }
        throw erro;
      }
    });
  }
}
