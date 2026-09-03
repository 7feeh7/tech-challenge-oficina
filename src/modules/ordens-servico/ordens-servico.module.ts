import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { CatalogoGateway } from './application/ports/catalogo.gateway';
import { NotificadorDeStatusGateway } from './application/ports/notificador-status.gateway';
import { OrdemServicoGateway } from './application/ports/ordem-servico.gateway';
import {
  CATALOGO_GATEWAY,
  NOTIFICADOR_STATUS_GATEWAY,
  ORDEM_SERVICO_GATEWAY,
} from './application/ports/tokens';
import { AtualizarOrdemServicoUseCase } from './application/use-cases/atualizar-ordem-servico.use-case';
import { BuscarOrdemServicoUseCase } from './application/use-cases/buscar-ordem-servico.use-case';
import { CalcularTempoMedioUseCase } from './application/use-cases/calcular-tempo-medio.use-case';
import { CriarOrdemServicoUseCase } from './application/use-cases/criar-ordem-servico.use-case';
import { ListarOrdensServicoUseCase } from './application/use-cases/listar-ordens-servico.use-case';
import { RemoverOrdemServicoUseCase } from './application/use-cases/remover-ordem-servico.use-case';
import { OrdensServicoController } from './infra/http/controllers/ordens-servico.controller';
import { SendGridNotificadorStatusGateway } from './infra/notification/sendgrid-notificador-status.gateway';
import { PrismaCatalogoGateway } from './infra/persistence/prisma-catalogo.gateway';
import { PrismaOrdemServicoGateway } from './infra/persistence/prisma-ordem-servico.gateway';

/**
 * Wiring do módulo: liga as portas da camada de aplicação aos adaptadores de
 * infraestrutura. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 */
@Module({
  imports: [PrismaModule],
  controllers: [OrdensServicoController],
  providers: [
    PrismaOrdemServicoGateway,
    PrismaCatalogoGateway,
    SendGridNotificadorStatusGateway,
    { provide: ORDEM_SERVICO_GATEWAY, useExisting: PrismaOrdemServicoGateway },
    { provide: CATALOGO_GATEWAY, useExisting: PrismaCatalogoGateway },
    {
      provide: NOTIFICADOR_STATUS_GATEWAY,
      useExisting: SendGridNotificadorStatusGateway,
    },
    {
      provide: CriarOrdemServicoUseCase,
      useFactory: (ordens: OrdemServicoGateway, catalogo: CatalogoGateway) =>
        new CriarOrdemServicoUseCase(ordens, catalogo),
      inject: [ORDEM_SERVICO_GATEWAY, CATALOGO_GATEWAY],
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
        catalogo: CatalogoGateway,
        notificador: NotificadorDeStatusGateway,
      ) => new AtualizarOrdemServicoUseCase(ordens, catalogo, notificador),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        CATALOGO_GATEWAY,
        NOTIFICADOR_STATUS_GATEWAY,
      ],
    },
    {
      provide: RemoverOrdemServicoUseCase,
      useFactory: (ordens: OrdemServicoGateway) =>
        new RemoverOrdemServicoUseCase(ordens),
      inject: [ORDEM_SERVICO_GATEWAY],
    },
    {
      provide: CalcularTempoMedioUseCase,
      useFactory: (ordens: OrdemServicoGateway) =>
        new CalcularTempoMedioUseCase(ordens),
      inject: [ORDEM_SERVICO_GATEWAY],
    },
  ],
  // O módulo de orçamentos também move a OS pelo fluxo (gerar, aprovar, recusar)
  // e precisa avisar o cliente pelo mesmo canal — reusa esta porta em vez de
  // declarar outro notificador.
  exports: [NOTIFICADOR_STATUS_GATEWAY],
})
export class OrdensServicoModule {}
