import { Module, forwardRef } from '@nestjs/common';
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
import { COMPENSACAO_AVANCO } from '@/shared/saga/compensacao-avanco.port';
import {
  ESTADO_COMPENSACAO_GATEWAY,
  PEDIDO_EMITIDO_GATEWAY,
  PROJECAO_FINANCEIRA_GATEWAY,
} from './application/ports/tokens';
import { ReagirFatoSagaUseCase } from './application/use-cases/reagir-fato-saga.use-case';
import { PrismaPedidoEmitidoGateway } from './infra/persistence/prisma-pedido-emitido.gateway';
import { PrismaProjecaoFinanceiraGateway } from './infra/persistence/prisma-projecao-financeira.gateway';
import { PrismaEstadoCompensacaoGateway } from './infra/persistence/prisma-estado-compensacao.gateway';
import { ProcessadoresSagaProvider } from './infra/messaging/processadores-saga.provider';
import { ComandosSagaOutboxService } from './application/services/comandos-saga-outbox.service';
import { CompensacaoSagaService } from './application/services/compensacao-saga.service';

@Module({
  imports: [
    PrismaModule,
    ObservabilityModule,
    forwardRef(() => MensageriaModule),
    forwardRef(() => OrdensServicoModule),
    ReservasEstoqueModule,
  ],
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
    {
      provide: ComandosSagaOutboxService,
      useFactory: (
        outbox: OutboxGateway,
        pedidos: PrismaPedidoEmitidoGateway,
      ) => new ComandosSagaOutboxService(outbox, pedidos),
      inject: [OUTBOX_GATEWAY, PrismaPedidoEmitidoGateway],
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
      ],
    },
    {
      provide: COMPENSACAO_AVANCO,
      useExisting: CompensacaoSagaService,
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
      ],
    },
    ProcessadoresSagaProvider,
    {
      provide: PROCESSADORES_MENSAGEM,
      useFactory: (provider: ProcessadoresSagaProvider) => provider.lista,
      inject: [ProcessadoresSagaProvider],
    },
  ],
  exports: [PROCESSADORES_MENSAGEM, COMPENSACAO_AVANCO],
})
export class CoordenacaoSagaModule {}
