import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from './resultado-cancelamento-execucao';
import { SituacaoTarefaCancelamento } from './situacao-tarefa-cancelamento';

export interface DivergenciaRespostaCancelamento {
  itemId: string;
  quantidadePrevista?: number;
  quantidadeUtilizada?: number;
  observacao?: string;
  tipo?: string;
  justificativa?: string;
}

export interface RespostaCancelamentoContrato {
  tipoTarefa: TipoTarefaCancelamento;
  resultado: ResultadoCancelamentoExecucao;
  concluidaEm?: string;
  situacaoTarefa?: SituacaoTarefaCancelamento;
  encerradaEm?: string;
  responsavelId?: string;
  motivo?: string;
  fatoTerminalEventId?: string;
  pecasUtilizadas?: { itemId: string; quantidade: number }[];
  servicosRealizados?: { itemId: string; quantidade: number }[];
  divergencias?: DivergenciaRespostaCancelamento[];
}
