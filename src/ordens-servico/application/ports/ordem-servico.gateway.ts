import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import { StatusOS } from '../../domain/status-os';

export interface ClienteDaOrdem {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
}

export interface VeiculoDaOrdem {
  id: string;
  placa: string;
  modelo: string;
  marca?: string;
  ano?: number;
}

export interface ItemServicoDetalhe {
  id: string;
  servico: { id: string; nome: string };
  quantidade: number;
  precoUnitario: number;
}

export interface ItemPecaDetalhe {
  id: string;
  peca: { id: string; codigo: string; nome: string };
  quantidade: number;
  precoUnitario: number;
}

/** Leitura completa da OS, com os dados dos agregados vizinhos já resolvidos. */
export interface OrdemServicoDetalhe {
  ordem: OrdemServico;
  cliente: ClienteDaOrdem;
  veiculo: VeiculoDaOrdem;
  servicos: ItemServicoDetalhe[];
  pecas: ItemPecaDetalhe[];
  orcamentos: unknown[];
  historicoStatus: unknown[];
}

/** Leitura enxuta usada na listagem. */
export interface OrdemServicoResumo {
  ordem: OrdemServico;
  cliente: ClienteDaOrdem;
  veiculo: VeiculoDaOrdem;
}

export interface PaginaOrdensServico {
  ordens: OrdemServicoResumo[];
  total: number;
}

/** Entrada do histórico gravada junto com a mudança de status. */
export interface RegistroDeStatus {
  statusAnterior: StatusOS | null;
  statusNovo: StatusOS;
  observacao?: string;
}

/** Marcos de tempo usados pelo cálculo de métricas. */
export interface MarcosDeTempo {
  criadoEm: Date;
  iniciadaEm: Date | null;
  finalizadaEm: Date | null;
  entregueEm: Date | null;
}

export interface OrdemServicoGateway {
  buscarPorId(id: string): Promise<OrdemServico | null>;
  buscarDetalhePorId(id: string): Promise<OrdemServicoDetalhe | null>;
  listar(
    page: number,
    limit: number,
    status?: StatusOS,
  ): Promise<PaginaOrdensServico>;
  /** Cria a OS com seus itens e a primeira entrada do histórico (mesma transação). */
  criar(
    ordem: OrdemServico,
    registro: RegistroDeStatus,
  ): Promise<OrdemServicoDetalhe>;
  /** Atualiza a OS, insere os itens adicionados e grava o histórico se o status mudou. */
  atualizar(
    id: string,
    ordem: OrdemServico,
    registro?: RegistroDeStatus,
  ): Promise<OrdemServicoDetalhe>;
  remover(id: string): Promise<void>;
  buscarMarcosDeTempo(
    dataInicio?: Date,
    dataFim?: Date,
  ): Promise<MarcosDeTempo[]>;
}
