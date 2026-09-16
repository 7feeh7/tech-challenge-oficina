import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { Orcamento } from '../../domain/entities/orcamento.entity';

export interface PaginaOrcamentos {
  orcamentos: Orcamento[];
  total: number;
}

/** Peça da OS com o saldo atual, para validar a baixa antes de aprovar. */
export interface PecaDaOrdem {
  pecaId: string;
  quantidade: number;
  saldoDisponivel: number;
}

export interface OrdemDoOrcamento {
  id: string;
  pecas: PecaDaOrdem[];
}

/** Baixa a ser aplicada em uma peça quando o orçamento é aprovado. */
export interface BaixaDeEstoque {
  pecaId: string;
  quantidade: number;
  novoSaldo: number;
}

/** O que a decisão sobre o orçamento provocou na OS — o que o cliente precisa saber. */
export interface TransicaoDaOrdem {
  ordemServicoId: string;
  numeroOS?: number;
  cliente: { nome: string; email: string };
  statusAnterior: StatusOS;
  statusNovo: StatusOS;
}

/**
 * Gerar, aprovar e recusar são decisões que movem a OS junto. O gateway devolve
 * a transição que aconteceu para que o caso de uso possa notificar o cliente —
 * ou `undefined`, quando a OS não saiu do lugar.
 */
export interface ResultadoDaDecisao {
  orcamento: Orcamento;
  transicao?: TransicaoDaOrdem;
}

export interface OrcamentoGateway {
  buscarPorId(id: string): Promise<Orcamento | null>;
  listar(
    page: number,
    limit: number,
    ordemServicoId?: string,
  ): Promise<PaginaOrcamentos>;
  buscarOrdemComPecas(ordemServicoId: string): Promise<OrdemDoOrcamento | null>;
  existeOrcamentoAguardandoAprovacao(ordemServicoId: string): Promise<boolean>;
  /**
   * Cria o orçamento e move a OS para AGUARDANDO_APROVACAO, registrando o
   * histórico — tudo na mesma transação.
   */
  criarEEnviarParaAprovacao(orcamento: Orcamento): Promise<ResultadoDaDecisao>;
  atualizar(id: string, orcamento: Orcamento): Promise<Orcamento>;
  /**
   * Rejeita o orçamento e devolve a OS ao diagnóstico, para que a proposta seja
   * revista — tudo na mesma transação. A recusa é uma rodada de negociação, não
   * o fim do atendimento.
   */
  rejeitarEDevolverParaDiagnostico(
    orcamento: Orcamento,
  ): Promise<ResultadoDaDecisao>;
  /**
   * Aprova o orçamento, move a OS para EM_EXECUCAO, registra o histórico e dá
   * baixa no estoque de todas as peças da OS — tudo na mesma transação.
   */
  aprovarComBaixaDeEstoque(
    orcamento: Orcamento,
    baixas: BaixaDeEstoque[],
  ): Promise<ResultadoDaDecisao>;
  remover(id: string): Promise<void>;
}
