import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PROCESSADORES_MENSAGEM } from '@/shared/messaging/application/ports/tokens';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { RESERVA_ESTOQUE_GATEWAY } from '@/modules/reservas-estoque/application/ports/tokens';
import type { ReservaEstoqueGateway } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ConsumirReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import { ORDEM_SERVICO_GATEWAY } from '@/modules/ordens-servico/application/ports/tokens';
import type { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  PEDIDO_EMITIDO_GATEWAY,
  PROJECAO_FINANCEIRA_GATEWAY,
} from './application/ports/tokens';
import { ReagirFatoSagaUseCase } from './application/use-cases/reagir-fato-saga.use-case';
import { PrismaPedidoEmitidoGateway } from './infra/persistence/prisma-pedido-emitido.gateway';
import { PrismaProjecaoFinanceiraGateway } from './infra/persistence/prisma-projecao-financeira.gateway';
import { ProcessadoresSagaProvider } from './infra/messaging/processadores-saga.provider';

@Module({
  imports: [
    PrismaModule,
    ObservabilityModule,
    forwardRef(() => OrdensServicoModule),
    ReservasEstoqueModule,
  ],
  providers: [
    PrismaPedidoEmitidoGateway,
    PrismaProjecaoFinanceiraGateway,
    {
      provide: PEDIDO_EMITIDO_GATEWAY,
      useExisting: PrismaPedidoEmitidoGateway,
    },
    {
      provide: PROJECAO_FINANCEIRA_GATEWAY,
      useExisting: PrismaProjecaoFinanceiraGateway,
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
      ],
    },
    ProcessadoresSagaProvider,
    {
      provide: PROCESSADORES_MENSAGEM,
      useFactory: (provider: ProcessadoresSagaProvider) => provider.lista,
      inject: [ProcessadoresSagaProvider],
    },
  ],
  exports: [PROCESSADORES_MENSAGEM],
})
export class CoordenacaoSagaModule {}
