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
  motivo: string;
}

export interface ResultadoConsumoReserva {
  linhasAtualizadas: LinhaReservaEstoque[];
  divergencias: DivergenciaInventarioDetalhe[];
  pendenciaInventarioId: string | null;
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
    },
  ): Promise<ResultadoConsumoReserva>;

  listarLinhasAtivas(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<LinhaReservaEstoque[]>;

  ajustarFisicoAdministrativo(
    contexto: ContextoTransacao,
    input: {
      pendenciaId: string;
      pecaId: string;
      quantidadeFisicaNova: number;
      motivo: string;
      responsavelId: string;
    },
  ): Promise<void>;
}
