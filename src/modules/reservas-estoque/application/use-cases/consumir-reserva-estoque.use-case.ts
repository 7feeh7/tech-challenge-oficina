import { createHash } from 'crypto';
import type {
  ContextoTransacao,
  UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import {
  SCOPE_ESTOQUE_CONSUMIR,
  hashCorpoEstoque,
} from '../estoque-idempotencia';
import type {
  ContextoConsumoEstoque,
  ItemReservaEstoque,
  ReservaEstoqueGateway,
  ResultadoConsumoReserva,
} from '../ports/reserva-estoque.gateway';

export interface ConsumirReservaEstoqueInput {
  ordemServicoId: string;
  rodada: number;
  itensUtilizados: ItemReservaEstoque[];
  idempotencyKey?: string;
  contextoFato?: ContextoConsumoEstoque;
}

export interface ConsumirReservaEstoqueOutput extends ResultadoConsumoReserva {
  reutilizado: boolean;
}

export class ConsumirReservaEstoqueUseCase {
  constructor(
    private readonly reservas: ReservaEstoqueGateway,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    input: ConsumirReservaEstoqueInput,
    contextoExterno?: ContextoTransacao,
  ): Promise<ConsumirReservaEstoqueOutput> {
    const requestHash = createHash('sha256')
      .update(hashCorpoEstoque(input))
      .digest('hex');

    const trabalho = async (contexto: ContextoTransacao) => {
      if (input.idempotencyKey) {
        const replay =
          await this.reservas.buscarIdempotencia<ConsumirReservaEstoqueOutput>(
            contexto,
            SCOPE_ESTOQUE_CONSUMIR,
            input.idempotencyKey,
            requestHash,
          );
        if (replay) {
          return { ...replay.resultado, reutilizado: true };
        }
      }

      const resultado = await this.reservas.consumir(contexto, {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        itensUtilizados: input.itensUtilizados,
        contextoFato: input.contextoFato,
      });

      const output: ConsumirReservaEstoqueOutput = {
        ...resultado,
        reutilizado: resultado.reutilizado,
      };

      if (input.idempotencyKey) {
        await this.reservas.gravarIdempotencia(
          contexto,
          SCOPE_ESTOQUE_CONSUMIR,
          input.idempotencyKey,
          requestHash,
          output,
        );
      }

      return output;
    };

    return contextoExterno
      ? trabalho(contextoExterno)
      : this.unitOfWork.executar(trabalho);
  }
}
