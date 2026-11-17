import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  OrdemServico,
  SugestaoItemOrdem,
} from '../../domain/entities/ordem-servico.entity';
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

export interface HistoricoStatusDetalhe {
  id: string;
  statusAnterior: StatusOS | null;
  statusNovo: StatusOS;
  rodada: number | null;
  eventId: string | null;
  motivo: string | null;
  observacao: string | null;
  alteradoPor: string | null;
  ocorridoEm: Date;
  criadoEm: Date;
}

/** Leitura completa da OS, com os dados dos agregados vizinhos já resolvidos. */
export interface OrdemServicoDetalhe {
  ordem: OrdemServico;
  cliente: ClienteDaOrdem;
  veiculo: VeiculoDaOrdem;
  servicos: ItemServicoDetalhe[];
  pecas: ItemPecaDetalhe[];
  sugestoes: readonly SugestaoItemOrdem[];
  orcamentos: unknown[];
  historicoStatus: HistoricoStatusDetalhe[];
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
  rodada: number;
  eventId: string;
  ocorridoEm: Date;
  motivo?: string | null;
  observacao?: string;
  alteradoPor?: string;
}

/** OS lida com bloqueio de linha, junto do cliente que precisa ser avisado. */
export interface OrdemServicoBloqueada {
  ordem: OrdemServico;
  cliente: { id: string; nome: string; email: string };
  veiculo: { placa: string; modelo: string };
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
  /** Fila ordenada pela prioridade persistida, com paginação no banco (D2.27). */
  listar(
    page: number,
    limit: number,
    status?: StatusOS,
  ): Promise<PaginaOrdensServico>;
  /** Grava a OS, as sugestões e a primeira entrada do histórico. */
  criar(
    contexto: ContextoTransacao,
    ordem: OrdemServico,
    registro: RegistroDeStatus,
  ): Promise<OrdemServicoBloqueada>;
  /** Lê a OS com `FOR UPDATE`, serializando as mudanças concorrentes sobre ela. */
  bloquearParaAtualizacao(
    contexto: ContextoTransacao,
    id: string,
  ): Promise<OrdemServicoBloqueada | null>;
  /** Grava estado, itens e, se houve mudança de status, a entrada do histórico. */
  salvar(
    contexto: ContextoTransacao,
    ordem: OrdemServico,
    registro?: RegistroDeStatus,
  ): Promise<void>;
  buscarMarcosDeTempo(
    dataInicio?: Date,
    dataFim?: Date,
  ): Promise<MarcosDeTempo[]>;
}
