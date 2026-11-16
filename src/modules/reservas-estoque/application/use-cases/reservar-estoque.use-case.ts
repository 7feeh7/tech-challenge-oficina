import { randomUUID, createHash } from 'crypto';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import {
  SCOPE_ESTOQUE_RESERVAR,
  hashCorpoEstoque,
} from '../estoque-idempotencia';
import type {
  ItemReservaEstoque,
  ReservaEstoqueGateway,
  ResultadoReservaEstoque,
} from '../ports/reserva-estoque.gateway';

export interface ReservarEstoqueInput {
  ordemServicoId: string;
  rodada: number;
  itens: ItemReservaEstoque[];
  prazoReferencia?: Date | null;
  permitirPecaInativa?: boolean;
  idempotencyKey?: string;
}

export interface ReservarEstoqueOutput extends ResultadoReservaEstoque {
  reutilizado: boolean;
}

export class ReservarEstoqueUseCase {
  constructor(
    private readonly reservas: ReservaEstoqueGateway,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: ReservarEstoqueInput): Promise<ReservarEstoqueOutput> {
    const requestHash = createHash('sha256')
      .update(hashCorpoEstoque(input))
      .digest('hex');

    return this.unitOfWork.executar(async (contexto) => {
      if (input.idempotencyKey) {
        const replay =
          await this.reservas.buscarIdempotencia<ReservarEstoqueOutput>(
            contexto,
            SCOPE_ESTOQUE_RESERVAR,
            input.idempotencyKey,
            requestHash,
          );
        if (replay) {
          return { ...replay.resultado, reutilizado: true };
        }
      }

      const grupoReservaId = randomUUID();
      const resultado = await this.reservas.reservar(contexto, {
        ordemServicoId: input.ordemServicoId,
        rodada: input.rodada,
        grupoReservaId,
        prazoReferencia: input.prazoReferencia ?? null,
        itens: input.itens,
        permitirPecaInativa: input.permitirPecaInativa ?? false,
      });

      const output: ReservarEstoqueOutput = {
        ...resultado,
        reutilizado: false,
      };

      if (input.idempotencyKey) {
        await this.reservas.gravarIdempotencia(
          contexto,
          SCOPE_ESTOQUE_RESERVAR,
          input.idempotencyKey,
          requestHash,
          output,
        );
      }

      return output;
    });
  }
}
