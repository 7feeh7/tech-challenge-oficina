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

export interface OrcamentoGateway {
  buscarPorId(id: string): Promise<Orcamento | null>;
  listar(
    page: number,
    limit: number,
    ordemServicoId?: string,
  ): Promise<PaginaOrcamentos>;
  buscarOrdemComPecas(ordemServicoId: string): Promise<OrdemDoOrcamento | null>;
  /**
   * Cria o orçamento e move a OS para AGUARDANDO_APROVACAO, registrando o
   * histórico — tudo na mesma transação.
   */
  criarEEnviarParaAprovacao(orcamento: Orcamento): Promise<Orcamento>;
  atualizar(id: string, orcamento: Orcamento): Promise<Orcamento>;
  /**
   * Aprova o orçamento, move a OS para EM_EXECUCAO, registra o histórico e dá
   * baixa no estoque de todas as peças da OS — tudo na mesma transação.
   */
  aprovarComBaixaDeEstoque(
    orcamento: Orcamento,
    baixas: BaixaDeEstoque[],
  ): Promise<Orcamento>;
  remover(id: string): Promise<void>;
}
