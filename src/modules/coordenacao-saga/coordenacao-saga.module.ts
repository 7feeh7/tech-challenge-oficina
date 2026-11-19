import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { PrismaModule } from '@/shared/database/prisma.module';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { PROCESSADORES_MENSAGEM } from '@/shared/messaging/application/ports/tokens';
import { OUTBOX_GATEWAY } from '@/shared/messaging/application/ports/tokens';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { RESERVA_ESTOQUE_GATEWAY } from '@/modules/reservas-estoque/application/ports/tokens';
import type { ReservaEstoqueGateway } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ConsumirReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import { LiberarReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/liberar-reserva-estoque.use-case';
import { ORDEM_SERVICO_GATEWAY } from '@/modules/ordens-servico/application/ports/tokens';
import type { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { PrismaService } from '@/shared/database/prisma.service';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { IdempotencyService } from '@/shared/idempotency/idempotency.service';
import type { RetomadaSagaInventarioPort } from '@/shared/saga/retomada-saga-inventario.port';
import { COMPENSACAO_AVANCO } from '@/shared/saga/compensacao-avanco.port';
import { RETOMADA_SAGA_INVENTARIO } from '@/shared/saga/retomada-saga-inventario.port';
import {
  ESTADO_COMPENSACAO_GATEWAY,
  PEDIDO_EMITIDO_GATEWAY,
  PENDENCIA_OS_GATEWAY,
  PROJECAO_FINANCEIRA_GATEWAY,
} from './application/ports/tokens';
import type { PendenciaOsGateway } from './application/ports/pendencia-os.gateway';
import { ReagirFatoSagaUseCase } from './application/use-cases/reagir-fato-saga.use-case';
import { ResolverPendenciaManualUseCase } from './application/use-cases/resolver-pendencia-manual.use-case';
import { PendenciasOsController } from './infra/http/controllers/pendencias-os.controller';
import { PrismaPendenciaOsGateway } from './infra/persistence/prisma-pendencia-os.gateway';
import { PrismaPedidoEmitidoGateway } from './infra/persistence/prisma-pedido-emitido.gateway';
import { PrismaProjecaoFinanceiraGateway } from './infra/persistence/prisma-projecao-financeira.gateway';
import { PrismaEstadoCompensacaoGateway } from './infra/persistence/prisma-estado-compensacao.gateway';
import { ProcessadoresSagaProvider } from './infra/messaging/processadores-saga.provider';
import { ComandosSagaOutboxService } from './application/services/comandos-saga-outbox.service';
import { CompensacaoSagaService } from './application/services/compensacao-saga.service';
import { ReconciliacaoConsumoSagaService } from './application/services/reconciliacao-consumo-saga.service';
import { RetomadaSagaInventarioService } from './application/services/retomada-saga-inventario.service';
import { ConsultaPrazoReferenciaService } from './application/services/consulta-prazo-referencia.service';
import { PrismaConsultaPrazoOrdemGateway } from './infra/persistence/prisma-consulta-prazo-ordem.gateway';
import { ProcessadorPrazoReferenciaService } from './infra/jobs/processador-prazo-referencia.service';
import { SolicitarConsultaFinanceiraUseCase } from './application/use-cases/solicitar-consulta-financeira.use-case';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';

@Module({
  imports: [
    PrismaModule,
    IdempotencyModule,
    ObservabilityModule,
    forwardRef(() => MensageriaModule),
    forwardRef(() => OrdensServicoModule),
    forwardRef(() => ReservasEstoqueModule),
  ],
  controllers: [PendenciasOsController],
  providers: [
    PrismaPedidoEmitidoGateway,
    PrismaProjecaoFinanceiraGateway,
    PrismaEstadoCompensacaoGateway,
    {
      provide: PEDIDO_EMITIDO_GATEWAY,
      useExisting: PrismaPedidoEmitidoGateway,
    },
    {
      provide: PROJECAO_FINANCEIRA_GATEWAY,
      useExisting: PrismaProjecaoFinanceiraGateway,
    },
    {
      provide: ESTADO_COMPENSACAO_GATEWAY,
      useExisting: PrismaEstadoCompensacaoGateway,
    },
    PrismaPendenciaOsGateway,
    {
      provide: PENDENCIA_OS_GATEWAY,
      useExisting: PrismaPendenciaOsGateway,
    },
    {
      provide: ComandosSagaOutboxService,
      useFactory: (
        outbox: OutboxGateway,
        pedidos: PrismaPedidoEmitidoGateway,
      ) => new ComandosSagaOutboxService(outbox, pedidos),
      inject: [OUTBOX_GATEWAY, PrismaPedidoEmitidoGateway],
    },
    {
      provide: ReconciliacaoConsumoSagaService,
      useFactory: (
        consumir: ConsumirReservaEstoqueUseCase,
        reservas: ReservaEstoqueGateway,
        prisma: PrismaService,
      ) => new ReconciliacaoConsumoSagaService(consumir, reservas, prisma),
      inject: [
        ConsumirReservaEstoqueUseCase,
        RESERVA_ESTOQUE_GATEWAY,
        PrismaService,
      ],
    },
    {
      provide: CompensacaoSagaService,
      useFactory: (
        ordens: OrdemServicoGateway,
        transicoes: TransicaoOrdemServicoService,
        estado: PrismaEstadoCompensacaoGateway,
        pedidos: PrismaPedidoEmitidoGateway,
        comandos: ComandosSagaOutboxService,
        consumir: ConsumirReservaEstoqueUseCase,
        liberar: LiberarReservaEstoqueUseCase,
        reservas: ReservaEstoqueGateway,
        logger: JsonLoggerService,
        prisma: PrismaService,
        reconciliacao: ReconciliacaoConsumoSagaService,
      ) =>
        new CompensacaoSagaService(
          ordens,
          transicoes,
          estado,
          pedidos,
          comandos,
          consumir,
          liberar,
          reservas,
          logger,
          prisma,
          reconciliacao,
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        TransicaoOrdemServicoService,
        PrismaEstadoCompensacaoGateway,
        PrismaPedidoEmitidoGateway,
        ComandosSagaOutboxService,
        ConsumirReservaEstoqueUseCase,
        LiberarReservaEstoqueUseCase,
        RESERVA_ESTOQUE_GATEWAY,
        JsonLoggerService,
        PrismaService,
        ReconciliacaoConsumoSagaService,
      ],
    },
    {
      provide: COMPENSACAO_AVANCO,
      useExisting: CompensacaoSagaService,
    },
    {
      provide: RetomadaSagaInventarioService,
      useFactory: (
        ordens: OrdemServicoGateway,
        transicoes: TransicaoOrdemServicoService,
        compensacao: CompensacaoSagaService,
        prisma: PrismaService,
      ) =>
        new RetomadaSagaInventarioService(
          ordens,
          transicoes,
          compensacao,
          prisma,
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        TransicaoOrdemServicoService,
        CompensacaoSagaService,
        PrismaService,
      ],
    },
    {
      provide: RETOMADA_SAGA_INVENTARIO,
      useExisting: RetomadaSagaInventarioService,
    },
    {
      provide: ResolverPendenciaManualUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        pendencias: PendenciaOsGateway,
        reservas: ReservaEstoqueGateway,
        retomadaInventario: RetomadaSagaInventarioPort,
        unitOfWork: UnitOfWork,
        idempotency: IdempotencyService,
        prisma: PrismaService,
      ) =>
        new ResolverPendenciaManualUseCase(
          ordens,
          pendencias,
          reservas,
          retomadaInventario,
          unitOfWork,
          idempotency,
          prisma,
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        PENDENCIA_OS_GATEWAY,
        RESERVA_ESTOQUE_GATEWAY,
        RETOMADA_SAGA_INVENTARIO,
        UNIT_OF_WORK,
        IdempotencyService,
        PrismaService,
      ],
    },
    {
      provide: ConsultaPrazoReferenciaService,
      useFactory: (
        ordens: OrdemServicoGateway,
        estado: PrismaEstadoCompensacaoGateway,
        comandos: ComandosSagaOutboxService,
        pedidos: PrismaPedidoEmitidoGateway,
        prisma: PrismaService,
        config: ConfigService,
      ) =>
        new ConsultaPrazoReferenciaService(
          ordens,
          estado,
          comandos,
          pedidos,
          prisma,
          Number(
            config.get<string>('PRAZO_REFERENCIA_RECONSULTA_CICLOS') ?? '5',
          ),
          Number(
            config.get<string>('PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS') ??
              '10000',
          ),
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        PrismaEstadoCompensacaoGateway,
        ComandosSagaOutboxService,
        PrismaPedidoEmitidoGateway,
        PrismaService,
        ConfigService,
      ],
    },
    PrismaConsultaPrazoOrdemGateway,
    ProcessadorPrazoReferenciaService,
    {
      provide: SolicitarConsultaFinanceiraUseCase,
      useFactory: (
        unitOfWork: UnitOfWork,
        consulta: ConsultaPrazoReferenciaService,
      ) => new SolicitarConsultaFinanceiraUseCase(unitOfWork, consulta),
      inject: [UNIT_OF_WORK, ConsultaPrazoReferenciaService],
    },
    {
      provide: ReagirFatoSagaUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        transicoes: TransicaoOrdemServicoService,
        consumir: ConsumirReservaEstoqueUseCase,
        reservas: ReservaEstoqueGateway,
        pedidos: PrismaPedidoEmitidoGateway,
        projecao: PrismaProjecaoFinanceiraGateway,
        logger: JsonLoggerService,
        prisma: PrismaService,
        compensacao: CompensacaoSagaService,
        estado: PrismaEstadoCompensacaoGateway,
        outbox: OutboxGateway,
        consultaPrazo: ConsultaPrazoReferenciaService,
        osMetrics: OsMetricsService,
        reconciliacao: ReconciliacaoConsumoSagaService,
      ) =>
        new ReagirFatoSagaUseCase(
          ordens,
          transicoes,
          consumir,
          reservas,
          pedidos,
          projecao,
          logger,
          prisma,
          compensacao,
          estado,
          outbox,
          consultaPrazo,
          osMetrics,
          reconciliacao,
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        TransicaoOrdemServicoService,
        ConsumirReservaEstoqueUseCase,
        RESERVA_ESTOQUE_GATEWAY,
        PrismaPedidoEmitidoGateway,
        PrismaProjecaoFinanceiraGateway,
        JsonLoggerService,
        PrismaService,
        CompensacaoSagaService,
        PrismaEstadoCompensacaoGateway,
        OUTBOX_GATEWAY,
        ConsultaPrazoReferenciaService,
        OsMetricsService,
        ReconciliacaoConsumoSagaService,
      ],
    },
    ProcessadoresSagaProvider,
    {
      provide: PROCESSADORES_MENSAGEM,
      useFactory: (provider: ProcessadoresSagaProvider) => provider.lista,
      inject: [ProcessadoresSagaProvider],
    },
  ],
  exports: [
    PROCESSADORES_MENSAGEM,
    COMPENSACAO_AVANCO,
    RETOMADA_SAGA_INVENTARIO,
    SolicitarConsultaFinanceiraUseCase,
  ],
})
export class CoordenacaoSagaModule {}
