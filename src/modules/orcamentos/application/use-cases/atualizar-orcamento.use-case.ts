import { NotificadorDeStatusGateway } from '@/modules/ordens-servico/application/ports/notificador-status.gateway';
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
import {
  BaixaDeEstoque,
  OrcamentoGateway,
  ResultadoDaDecisao,
} from '../ports/orcamento.gateway';
import { notificarTransicao } from './notificar-transicao';

export interface AtualizarOrcamentoInput {
  valorTotal?: number;
  observacoes?: string;
  status?: StatusOrcamento;
  motivoRejeicao?: string;
}

export class AtualizarOrcamentoUseCase {
  constructor(
    private readonly orcamentos: OrcamentoGateway,
    private readonly notificador: NotificadorDeStatusGateway,
  ) {}

  async execute(
    id: string,
    input: AtualizarOrcamentoInput,
  ): Promise<OrcamentoOutput> {
    const orcamento = await this.orcamentos.buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoError(id);
    }

    // A decisão do cliente só repercute na OS na primeira vez: reenviar o mesmo
    // status é idempotente e não baixa estoque nem mexe no fluxo de novo.
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
      return await this.decidir(() => this.aprovar(orcamento));
    }

    if (rejeitandoAgora) {
      return await this.decidir(() =>
        this.orcamentos.rejeitarEDevolverParaDiagnostico(orcamento),
      );
    }

    return OrcamentoOutputMapper.toOutput(
      await this.orcamentos.atualizar(id, orcamento),
    );
  }

  /** Toda decisão que move a OS avisa o cliente da mudança de status. */
  private async decidir(
    aplicar: () => Promise<ResultadoDaDecisao>,
  ): Promise<OrcamentoOutput> {
    const resultado = await aplicar();

    await notificarTransicao(this.notificador, resultado.transicao);

    return OrcamentoOutputMapper.toOutput(resultado.orcamento);
  }

  /**
   * Aprovar consome o estoque das peças da OS. A checagem acontece antes da
   * escrita: ou todas as baixas cabem, ou nenhuma é aplicada.
   */
  private async aprovar(orcamento: Orcamento): Promise<ResultadoDaDecisao> {
    const ordem = await this.orcamentos.buscarOrdemComPecas(
      orcamento.ordemServicoId,
    );
    if (!ordem) {
      throw new OrdemDoOrcamentoNaoEncontradaError(orcamento.ordemServicoId);
    }

    const baixas: BaixaDeEstoque[] = ordem.pecas.map((peca) => {
      if (peca.saldoDisponivel < peca.quantidade) {
        throw new EstoqueInsuficienteParaAprovacaoError(
          peca.pecaId,
          peca.saldoDisponivel,
          peca.quantidade,
        );
      }

      return {
        pecaId: peca.pecaId,
        quantidade: peca.quantidade,
        novoSaldo: peca.saldoDisponivel - peca.quantidade,
      };
    });

    return await this.orcamentos.aprovarComBaixaDeEstoque(orcamento, baixas);
  }
}
