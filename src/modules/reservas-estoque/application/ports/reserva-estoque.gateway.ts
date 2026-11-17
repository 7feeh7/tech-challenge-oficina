import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { SituacaoReservaEstoque } from '../../domain/situacao-reserva-estoque';

export interface ItemReservaEstoque {
  pecaId: string;
  quantidade: number;
}

export interface SaldoPecaEstoque {
  pecaId: string;
  quantidadeFisica: number;
  quantidadeReservada: number;
  disponivel: number;
  ativo: boolean;
}

export interface LinhaReservaEstoque {
  id: string;
  grupoReservaId: string;
  ordemServicoId: string;
  rodada: number;
  pecaId: string;
  quantidade: number;
  quantidadeConsumida: number;
  situacao: SituacaoReservaEstoque;
  prazoReferencia: Date | null;
}

export interface ResultadoReservaEstoque {
  grupoReservaId: string;
  prazoReferencia: Date | null;
  linhas: LinhaReservaEstoque[];
}

export interface DivergenciaInventarioDetalhe {
  pecaId: string;
  quantidadeReservada: number;
  quantidadeInformada: number;
  quantidadePrevista?: number;
  quantidadeUtilizada?: number;
  tipo?: string | null;
  observacao?: string | null;
  justificativa?: string | null;
  motivo: string;
}

export interface ContextoConsumoEstoque {
  eventId: string;
  fatoOcorridoEm: Date;
  concluidoEm?: Date | null;
  responsavelId?: string | null;
  tipoFato: 'REPARO_CONCLUIDO' | 'REPARO_FALHOU' | 'REPARO_INTERROMPIDO';
  divergenciasFato?: DivergenciaInventarioDetalhe[];
  consumoEfetivo?: { itemId: string; quantidade: number }[];
  aguardandoFinalizacao?: boolean;
}

export interface ResultadoConsumoReserva {
  linhasAtualizadas: LinhaReservaEstoque[];
  divergencias: DivergenciaInventarioDetalhe[];
  divergenciasAuditoria: DivergenciaInventarioDetalhe[];
  pendenciaInventarioId: string | null;
  impedimentoInventario: boolean;
  consumoAplicadoId: string | null;
  reutilizado: boolean;
}

export interface ResultadoIdempotenciaEstoque<T> {
  reutilizado: boolean;
  resultado: T;
}

export interface ReservaEstoqueGateway {
  buscarIdempotencia<T>(
    contexto: ContextoTransacao,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<ResultadoIdempotenciaEstoque<T> | null>;

  gravarIdempotencia(
    contexto: ContextoTransacao,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
    responseBody: unknown,
  ): Promise<void>;

  reservar(
    contexto: ContextoTransacao,
    input: {
      ordemServicoId: string;
      rodada: number;
      grupoReservaId: string;
      prazoReferencia: Date | null;
      itens: ItemReservaEstoque[];
      permitirPecaInativa: boolean;
    },
  ): Promise<ResultadoReservaEstoque>;

  liberar(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<LinhaReservaEstoque[]>;

  consumir(
    contexto: ContextoTransacao,
    input: {
      ordemServicoId: string;
      rodada: number;
      itensUtilizados: ItemReservaEstoque[];
      contextoFato?: ContextoConsumoEstoque;
    },
  ): Promise<ResultadoConsumoReserva>;

  possuiConsumoAplicadoNaRodada(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<boolean>;

  listarLinhasAtivas(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<LinhaReservaEstoque[]>;

  /**
   * Legado pré-migration: todas as peças informadas com reserva CONSUMIDA.
   * Complemento E29: preferir `possuiConsumoAplicadoNaRodada`.
   */
  possuiConsumoAplicado(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    pecaIds: string[],
  ): Promise<boolean>;

  ajustarFisicoAdministrativo(
    contexto: ContextoTransacao,
    input: {
      pendenciaId: string;
      pecaId: string;
      quantidadeFisicaNova: number;
      motivo: string;
      responsavelId: string;
    },
  ): Promise<{ ordemServicoId: string }>;
}
