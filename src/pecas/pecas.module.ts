import { Module } from '@nestjs/common';
import { PrismaModule } from '@/database/prisma.module';
import { PecaGateway } from './application/ports/peca.gateway';
import { PECA_GATEWAY } from './application/ports/tokens';
import { AtualizarPecaUseCase } from './application/use-cases/atualizar-peca.use-case';
import { BuscarPecaUseCase } from './application/use-cases/buscar-peca.use-case';
import { CriarPecaUseCase } from './application/use-cases/criar-peca.use-case';
import { ListarPecasUseCase } from './application/use-cases/listar-pecas.use-case';
import { RemoverPecaUseCase } from './application/use-cases/remover-peca.use-case';
import { PecasController } from './infra/http/controllers/pecas.controller';
import { PrismaPecaGateway } from './infra/persistence/prisma-peca.gateway';

/**
 * Wiring do módulo: liga a porta da camada de aplicação ao adaptador de
 * persistência. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PecasController],
  providers: [
    PrismaPecaGateway,
    { provide: PECA_GATEWAY, useExisting: PrismaPecaGateway },
    {
      provide: CriarPecaUseCase,
      useFactory: (gateway: PecaGateway) => new CriarPecaUseCase(gateway),
      inject: [PECA_GATEWAY],
    },
    {
      provide: ListarPecasUseCase,
      useFactory: (gateway: PecaGateway) => new ListarPecasUseCase(gateway),
      inject: [PECA_GATEWAY],
    },
    {
      provide: BuscarPecaUseCase,
      useFactory: (gateway: PecaGateway) => new BuscarPecaUseCase(gateway),
      inject: [PECA_GATEWAY],
    },
    {
      provide: AtualizarPecaUseCase,
      useFactory: (gateway: PecaGateway) => new AtualizarPecaUseCase(gateway),
      inject: [PECA_GATEWAY],
    },
    {
      provide: RemoverPecaUseCase,
      useFactory: (gateway: PecaGateway) => new RemoverPecaUseCase(gateway),
      inject: [PECA_GATEWAY],
    },
  ],
})
export class PecasModule {}
