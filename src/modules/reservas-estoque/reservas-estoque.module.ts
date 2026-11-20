import { Module, forwardRef } from '@nestjs/common';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { RETOMADA_SAGA_INVENTARIO } from '@/shared/saga/retomada-saga-inventario.port';
import type { RetomadaSagaInventarioPort } from '@/shared/saga/retomada-saga-inventario.port';
import { PrismaModule } from '@/shared/database/prisma.module';
import { UNIT_OF_WORK } from '@/shared/database/unit-of-work.port';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { RESERVA_ESTOQUE_GATEWAY } from './application/ports/tokens';
import type { ReservaEstoqueGateway } from './application/ports/reserva-estoque.gateway';
import { ReservarEstoqueUseCase } from './application/use-cases/reservar-estoque.use-case';
import { LiberarReservaEstoqueUseCase } from './application/use-cases/liberar-reserva-estoque.use-case';
import { ConsumirReservaEstoqueUseCase } from './application/use-cases/consumir-reserva-estoque.use-case';
import { AjustarEstoqueDivergenciaUseCase } from './application/use-cases/ajustar-estoque-divergencia.use-case';
import { ResolverConsumoManualUseCase } from './application/use-cases/resolver-consumo-manual.use-case';
import { PrismaReservaEstoqueGateway } from './infra/persistence/prisma-reserva-estoque.gateway';
import { ReservasEstoqueController } from './infra/http/controllers/reservas-estoque.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => CoordenacaoSagaModule)],
  controllers: [ReservasEstoqueController],
  providers: [
    PrismaReservaEstoqueGateway,
    {
      provide: RESERVA_ESTOQUE_GATEWAY,
      useExisting: PrismaReservaEstoqueGateway,
    },
    {
      provide: ReservarEstoqueUseCase,
      useFactory: (reservas: ReservaEstoqueGateway, uow: UnitOfWork) =>
        new ReservarEstoqueUseCase(reservas, uow),
      inject: [RESERVA_ESTOQUE_GATEWAY, UNIT_OF_WORK],
    },
    {
      provide: LiberarReservaEstoqueUseCase,
      useFactory: (reservas: ReservaEstoqueGateway, uow: UnitOfWork) =>
        new LiberarReservaEstoqueUseCase(reservas, uow),
      inject: [RESERVA_ESTOQUE_GATEWAY, UNIT_OF_WORK],
    },
    {
      provide: ConsumirReservaEstoqueUseCase,
      useFactory: (reservas: ReservaEstoqueGateway, uow: UnitOfWork) =>
        new ConsumirReservaEstoqueUseCase(reservas, uow),
      inject: [RESERVA_ESTOQUE_GATEWAY, UNIT_OF_WORK],
    },
    {
      provide: AjustarEstoqueDivergenciaUseCase,
      useFactory: (
        reservas: ReservaEstoqueGateway,
        uow: UnitOfWork,
        retomadaInventario: RetomadaSagaInventarioPort,
      ) =>
        new AjustarEstoqueDivergenciaUseCase(reservas, uow, retomadaInventario),
      inject: [RESERVA_ESTOQUE_GATEWAY, UNIT_OF_WORK, RETOMADA_SAGA_INVENTARIO],
    },
    {
      provide: ResolverConsumoManualUseCase,
      useFactory: (
        reservas: ReservaEstoqueGateway,
        uow: UnitOfWork,
        retomadaInventario: RetomadaSagaInventarioPort,
      ) => new ResolverConsumoManualUseCase(reservas, uow, retomadaInventario),
      inject: [RESERVA_ESTOQUE_GATEWAY, UNIT_OF_WORK, RETOMADA_SAGA_INVENTARIO],
    },
  ],
  exports: [
    RESERVA_ESTOQUE_GATEWAY,
    ReservarEstoqueUseCase,
    LiberarReservaEstoqueUseCase,
    ConsumirReservaEstoqueUseCase,
    AjustarEstoqueDivergenciaUseCase,
    ResolverConsumoManualUseCase,
  ],
})
export class ReservasEstoqueModule {}
