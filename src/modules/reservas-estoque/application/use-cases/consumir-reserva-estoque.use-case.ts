import { createHash } from 'crypto';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import {
  SCOPE_ESTOQUE_CONSUMIR,
  hashCorpoEstoque,
} from '../estoque-idempotencia';
import type {
  ItemReservaEstoque,
  ReservaEstoqueGateway,
  ResultadoConsumoReserva,
} from '../ports/reserva-estoque.gateway';

export interface ConsumirReservaEstoqueInput {
  ordemServicoId: string;
  rodada: number;
  itensUtilizados: ItemReservaEstoque[];
  idempotencyKey?: string;
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
  ): Promise<ConsumirReservaEstoqueOutput> {
    const requestHash = createHash('sha256')
      .update(hashCorpoEstoque(input))
      .digest('hex');

    return this.unitOfWork.executar(async (contexto) => {
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
      });

      const output: ConsumirReservaEstoqueOutput = {
        ...resultado,
        reutilizado: false,
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
    });
  }
}
