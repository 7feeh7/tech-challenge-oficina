import type { TipoDivergenciaConsumo } from './tipo-divergencia-consumo';

/** Divergência recebida do Execution ou produzida pela conciliação do OS. */
export interface DivergenciaConsumoEfetivo {
  itemId: string;
  quantidadePrevista: number;
  quantidadeUtilizada: number;
  tipo?: TipoDivergenciaConsumo | string;
  observacao?: string;
  justificativa?: string | null;
  motivo?: string;
  quantidadeReservada?: number;
  quantidadeInformada?: number;
}

export interface ItemConsumoEfetivo {
  itemId: string;
  quantidade: number;
}

export interface ContextoConsumoFato {
  eventId: string;
  fatoOcorridoEm: Date;
  concluidoEm?: Date | null;
  responsavelId?: string | null;
  tipoFato: 'REPARO_CONCLUIDO' | 'REPARO_FALHOU' | 'REPARO_INTERROMPIDO';
}
