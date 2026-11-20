import { createHash } from 'crypto';
import type {
  ContextoTransacao,
  UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import {
  SCOPE_ESTOQUE_LIBERAR,
  hashCorpoEstoque,
} from '../estoque-idempotencia';
import type {
  LinhaReservaEstoque,
  ReservaEstoqueGateway,
} from '../ports/reserva-estoque.gateway';

export interface LiberarReservaEstoqueInput {
  ordemServicoId: string;
  rodada: number;
  idempotencyKey?: string;
}

export interface LiberarReservaEstoqueOutput {
  linhas: LinhaReservaEstoque[];
  reutilizado: boolean;
}

export class LiberarReservaEstoqueUseCase {
  constructor(
    private readonly reservas: ReservaEstoqueGateway,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    input: LiberarReservaEstoqueInput,
    contextoExterno?: ContextoTransacao,
  ): Promise<LiberarReservaEstoqueOutput> {
    const requestHash = createHash('sha256')
      .update(hashCorpoEstoque(input))
      .digest('hex');

    const trabalho = async (contexto: ContextoTransacao) => {
      if (input.idempotencyKey) {
        const replay =
          await this.reservas.buscarIdempotencia<LiberarReservaEstoqueOutput>(
            contexto,
            SCOPE_ESTOQUE_LIBERAR,
            input.idempotencyKey,
            requestHash,
          );
        if (replay) {
          return { ...replay.resultado, reutilizado: true };
        }
      }

      const linhas = await this.reservas.liberar(
        contexto,
        input.ordemServicoId,
        input.rodada,
      );

      const output: LiberarReservaEstoqueOutput = {
        linhas,
        reutilizado: false,
      };

      if (input.idempotencyKey) {
        await this.reservas.gravarIdempotencia(
          contexto,
          SCOPE_ESTOQUE_LIBERAR,
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
