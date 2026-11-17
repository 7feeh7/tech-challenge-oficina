import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';

export const RETOMADA_SAGA_INVENTARIO = Symbol('RETOMADA_SAGA_INVENTARIO');

export interface RetomadaSagaInventarioPort {
  retomarAposResolucaoInventario(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
  ): Promise<void>;
}

export class RetomadaSagaInventarioNoop implements RetomadaSagaInventarioPort {
  async retomarAposResolucaoInventario(): Promise<void> {}
}
