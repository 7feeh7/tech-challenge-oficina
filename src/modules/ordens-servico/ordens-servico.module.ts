import { Module, forwardRef } from '@nestjs/common';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import {
  COMPENSACAO_AVANCO,
  type CompensacaoAvancoPort,
} from '@/shared/saga/compensacao-avanco.port';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { PrismaModule } from '@/shared/database/prisma.module';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { OUTBOX_GATEWAY } from '@/shared/messaging/application/ports/tokens';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import { CatalogoGateway } from './application/ports/catalogo.gateway';
import { OrdemServicoGateway } from './application/ports/ordem-servico.gateway';
import {
  CATALOGO_GATEWAY,
  ORDEM_SERVICO_GATEWAY,
} from './application/ports/tokens';
import { TransicaoOrdemServicoService } from './application/services/transicao-ordem-servico.service';
import { AtualizarOrdemServicoUseCase } from './application/use-cases/atualizar-ordem-servico.use-case';
import { BuscarOrdemServicoUseCase } from './application/use-cases/buscar-ordem-servico.use-case';
import { CalcularTempoMedioUseCase } from './application/use-cases/calcular-tempo-medio.use-case';
import { CriarOrdemServicoUseCase } from './application/use-cases/criar-ordem-servico.use-case';
import { ListarOrdensServicoUseCase } from './application/use-cases/listar-ordens-servico.use-case';
import { RegistrarDesistenciaUseCase } from './application/use-cases/registrar-desistencia.use-case';
import { RegistrarRetiradaUseCase } from './application/use-cases/registrar-retirada.use-case';
import { OrdensServicoController } from './infra/http/controllers/ordens-servico.controller';
import { PrismaCatalogoGateway } from './infra/persistence/prisma-catalogo.gateway';
import { PrismaOrdemServicoGateway } from './infra/persistence/prisma-ordem-servico.gateway';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => MensageriaModule),
    forwardRef(() => CoordenacaoSagaModule),
  ],
  controllers: [OrdensServicoController],
  providers: [
    PrismaOrdemServicoGateway,
    PrismaCatalogoGateway,
    { provide: ORDEM_SERVICO_GATEWAY, useExisting: PrismaOrdemServicoGateway },
    { provide: CATALOGO_GATEWAY, useExisting: PrismaCatalogoGateway },
    {
      provide: TransicaoOrdemServicoService,
      useFactory: (
        ordens: OrdemServicoGateway,
        outbox: OutboxGateway,
        metricas: OsMetricsService,
      ) => new TransicaoOrdemServicoService(ordens, outbox, metricas),
      inject: [ORDEM_SERVICO_GATEWAY, OUTBOX_GATEWAY, OsMetricsService],
    },
    {
      provide: CriarOrdemServicoUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        catalogo: CatalogoGateway,
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
      ) =>
        new CriarOrdemServicoUseCase(ordens, catalogo, unitOfWork, transicoes),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        CATALOGO_GATEWAY,
        UNIT_OF_WORK,
        TransicaoOrdemServicoService,
      ],
    },
    {
      provide: ListarOrdensServicoUseCase,
      useFactory: (ordens: OrdemServicoGateway) =>
        new ListarOrdensServicoUseCase(ordens),
      inject: [ORDEM_SERVICO_GATEWAY],
    },
    {
      provide: BuscarOrdemServicoUseCase,
      useFactory: (ordens: OrdemServicoGateway) =>
        new BuscarOrdemServicoUseCase(ordens),
      inject: [ORDEM_SERVICO_GATEWAY],
    },
    {
      provide: AtualizarOrdemServicoUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
      ) => new AtualizarOrdemServicoUseCase(ordens, unitOfWork, transicoes),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        UNIT_OF_WORK,
        TransicaoOrdemServicoService,
      ],
    },
    {
      provide: RegistrarDesistenciaUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
        compensacao?: CompensacaoAvancoPort,
      ) =>
        new RegistrarDesistenciaUseCase(
          ordens,
          unitOfWork,
          transicoes,
          compensacao,
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        UNIT_OF_WORK,
        TransicaoOrdemServicoService,
        { token: COMPENSACAO_AVANCO, optional: true },
      ],
    },
    {
      provide: RegistrarRetiradaUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
      ) => new RegistrarRetiradaUseCase(ordens, unitOfWork, transicoes),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        UNIT_OF_WORK,
        TransicaoOrdemServicoService,
      ],
    },
    {
      provide: CalcularTempoMedioUseCase,
      useFactory: (ordens: OrdemServicoGateway) =>
        new CalcularTempoMedioUseCase(ordens),
      inject: [ORDEM_SERVICO_GATEWAY],
    },
  ],
  exports: [
    ORDEM_SERVICO_GATEWAY,
    CATALOGO_GATEWAY,
    TransicaoOrdemServicoService,
  ],
})
export class OrdensServicoModule {}
