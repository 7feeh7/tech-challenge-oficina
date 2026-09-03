import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { ServicoGateway } from './application/ports/servico.gateway';
import { SERVICO_GATEWAY } from './application/ports/tokens';
import { AtualizarServicoUseCase } from './application/use-cases/atualizar-servico.use-case';
import { BuscarServicoUseCase } from './application/use-cases/buscar-servico.use-case';
import { CriarServicoUseCase } from './application/use-cases/criar-servico.use-case';
import { ListarServicosUseCase } from './application/use-cases/listar-servicos.use-case';
import { RemoverServicoUseCase } from './application/use-cases/remover-servico.use-case';
import { ServicosController } from './infra/http/controllers/servicos.controller';
import { PrismaServicoGateway } from './infra/persistence/prisma-servico.gateway';

/**
 * Wiring do módulo: liga a porta da camada de aplicação ao adaptador de
 * persistência. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ServicosController],
  providers: [
    PrismaServicoGateway,
    { provide: SERVICO_GATEWAY, useExisting: PrismaServicoGateway },
    {
      provide: CriarServicoUseCase,
      useFactory: (gateway: ServicoGateway) => new CriarServicoUseCase(gateway),
      inject: [SERVICO_GATEWAY],
    },
    {
      provide: ListarServicosUseCase,
      useFactory: (gateway: ServicoGateway) =>
        new ListarServicosUseCase(gateway),
      inject: [SERVICO_GATEWAY],
    },
    {
      provide: BuscarServicoUseCase,
      useFactory: (gateway: ServicoGateway) =>
        new BuscarServicoUseCase(gateway),
      inject: [SERVICO_GATEWAY],
    },
    {
      provide: AtualizarServicoUseCase,
      useFactory: (gateway: ServicoGateway) =>
        new AtualizarServicoUseCase(gateway),
      inject: [SERVICO_GATEWAY],
    },
    {
      provide: RemoverServicoUseCase,
      useFactory: (gateway: ServicoGateway) =>
        new RemoverServicoUseCase(gateway),
      inject: [SERVICO_GATEWAY],
    },
  ],
})
export class ServicosModule {}
