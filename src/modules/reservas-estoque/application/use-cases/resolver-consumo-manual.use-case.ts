import { createHash } from 'crypto';
import type { RetomadaSagaInventarioPort } from '@/shared/saga/retomada-saga-inventario.port';
import type {
  ContextoTransacao,
  UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import {
  SCOPE_ESTOQUE_RESOLUCAO_CONSUMO_MANUAL,
  hashCorpoEstoque,
} from '../estoque-idempotencia';
import type {
  ItemReservaEstoque,
  ReservaEstoqueGateway,
} from '../ports/reserva-estoque.gateway';

export interface ResolverConsumoManualInput {
  pendenciaId: string;
  itensConsumidos: ItemReservaEstoque[];
  itensLiberados: ItemReservaEstoque[];
  motivo: string;
  responsavelId: string;
  idempotencyKey: string;
  ajustesFisicos?: { pecaId: string; quantidadeFisicaNova: number }[];
}

export interface ResolverConsumoManualOutput {
  ordemServicoId: string;
  rodada: number;
  resolucaoId: string;
  reutilizado: boolean;
}

export class ResolverConsumoManualUseCase {
  constructor(
    private readonly reservas: ReservaEstoqueGateway,
    private readonly unitOfWork: UnitOfWork,
    private readonly retomadaInventario: RetomadaSagaInventarioPort,
  ) {}

  async execute(
    input: ResolverConsumoManualInput,
    contextoExterno?: ContextoTransacao,
  ): Promise<ResolverConsumoManualOutput> {
    const requestHash = createHash('sha256')
      .update(hashCorpoEstoque(input))
      .digest('hex');

    const trabalho = async (
      contexto: ContextoTransacao,
    ): Promise<ResolverConsumoManualOutput> => {
      const replay =
        await this.reservas.buscarIdempotencia<ResolverConsumoManualOutput>(
          contexto,
          SCOPE_ESTOQUE_RESOLUCAO_CONSUMO_MANUAL,
          input.idempotencyKey,
          requestHash,
        );
      if (replay) {
        return { ...replay.resultado, reutilizado: true };
      }

      const resultado = await this.reservas.resolverConsumoManualInicial(
        contexto,
        input,
      );

      await this.retomadaInventario.retomarAposResolucaoInventario(
        contexto,
        resultado.ordemServicoId,
        input.idempotencyKey,
      );

      const output: ResolverConsumoManualOutput = {
        ...resultado,
        reutilizado: false,
      };

      await this.reservas.gravarIdempotencia(
        contexto,
        SCOPE_ESTOQUE_RESOLUCAO_CONSUMO_MANUAL,
        input.idempotencyKey,
        requestHash,
        output,
      );

      return output;
    };

    return contextoExterno
      ? trabalho(contextoExterno)
      : this.unitOfWork.executar(trabalho);
  }
}
