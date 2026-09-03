import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { NotificadorDeStatusGateway } from '@/modules/ordens-servico/application/ports/notificador-status.gateway';
import { NOTIFICADOR_STATUS_GATEWAY } from '@/modules/ordens-servico/application/ports/tokens';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { OrcamentoGateway } from './application/ports/orcamento.gateway';
import { ORCAMENTO_GATEWAY } from './application/ports/tokens';
import { AtualizarOrcamentoUseCase } from './application/use-cases/atualizar-orcamento.use-case';
import { BuscarOrcamentoUseCase } from './application/use-cases/buscar-orcamento.use-case';
import { CriarOrcamentoUseCase } from './application/use-cases/criar-orcamento.use-case';
import { ListarOrcamentosUseCase } from './application/use-cases/listar-orcamentos.use-case';
import { RemoverOrcamentoUseCase } from './application/use-cases/remover-orcamento.use-case';
import { OrcamentosController } from './infra/http/controllers/orcamentos.controller';
import { PrismaOrcamentoGateway } from './infra/persistence/prisma-orcamento.gateway';

/**
 * Wiring do módulo: liga a porta da camada de aplicação ao adaptador de
 * persistência. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 *
 * Importa `OrdensServicoModule` porque gerar, aprovar e recusar um orçamento
 * movem a OS pelo fluxo — e o cliente é avisado pelo mesmo notificador. A
 * dependência é de mão única: o módulo de OS não conhece orçamentos.
 */
@Module({
  imports: [PrismaModule, OrdensServicoModule],
  controllers: [OrcamentosController],
  providers: [
    PrismaOrcamentoGateway,
    { provide: ORCAMENTO_GATEWAY, useExisting: PrismaOrcamentoGateway },
    {
      provide: CriarOrcamentoUseCase,
      useFactory: (
        gateway: OrcamentoGateway,
        notificador: NotificadorDeStatusGateway,
      ) => new CriarOrcamentoUseCase(gateway, notificador),
      inject: [ORCAMENTO_GATEWAY, NOTIFICADOR_STATUS_GATEWAY],
    },
    {
      provide: ListarOrcamentosUseCase,
      useFactory: (gateway: OrcamentoGateway) =>
        new ListarOrcamentosUseCase(gateway),
      inject: [ORCAMENTO_GATEWAY],
    },
    {
      provide: BuscarOrcamentoUseCase,
      useFactory: (gateway: OrcamentoGateway) =>
        new BuscarOrcamentoUseCase(gateway),
      inject: [ORCAMENTO_GATEWAY],
    },
    {
      provide: AtualizarOrcamentoUseCase,
      useFactory: (
        gateway: OrcamentoGateway,
        notificador: NotificadorDeStatusGateway,
      ) => new AtualizarOrcamentoUseCase(gateway, notificador),
      inject: [ORCAMENTO_GATEWAY, NOTIFICADOR_STATUS_GATEWAY],
    },
    {
      provide: RemoverOrcamentoUseCase,
      useFactory: (gateway: OrcamentoGateway) =>
        new RemoverOrcamentoUseCase(gateway),
      inject: [ORCAMENTO_GATEWAY],
    },
  ],
})
export class OrcamentosModule {}
