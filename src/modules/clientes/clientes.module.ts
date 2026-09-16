import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { ClienteGateway } from './application/ports/cliente.gateway';
import { CLIENTE_GATEWAY } from './application/ports/tokens';
import { AtualizarClienteUseCase } from './application/use-cases/atualizar-cliente.use-case';
import { BuscarClienteUseCase } from './application/use-cases/buscar-cliente.use-case';
import { CriarClienteUseCase } from './application/use-cases/criar-cliente.use-case';
import { ListarClientesUseCase } from './application/use-cases/listar-clientes.use-case';
import { RemoverClienteUseCase } from './application/use-cases/remover-cliente.use-case';
import { AlterarStatusClienteUseCase } from './application/use-cases/alterar-status-cliente.use-case';
import { ClientesController } from './infra/http/controllers/clientes.controller';
import { PrismaClienteGateway } from './infra/persistence/prisma-cliente.gateway';

/**
 * Wiring do módulo: liga a porta da camada de aplicação ao adaptador de
 * persistência. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientesController],
  providers: [
    PrismaClienteGateway,
    { provide: CLIENTE_GATEWAY, useExisting: PrismaClienteGateway },
    {
      provide: CriarClienteUseCase,
      useFactory: (gateway: ClienteGateway) => new CriarClienteUseCase(gateway),
      inject: [CLIENTE_GATEWAY],
    },
    {
      provide: ListarClientesUseCase,
      useFactory: (gateway: ClienteGateway) =>
        new ListarClientesUseCase(gateway),
      inject: [CLIENTE_GATEWAY],
    },
    {
      provide: BuscarClienteUseCase,
      useFactory: (gateway: ClienteGateway) =>
        new BuscarClienteUseCase(gateway),
      inject: [CLIENTE_GATEWAY],
    },
    {
      provide: AtualizarClienteUseCase,
      useFactory: (gateway: ClienteGateway) =>
        new AtualizarClienteUseCase(gateway),
      inject: [CLIENTE_GATEWAY],
    },
    {
      provide: RemoverClienteUseCase,
      useFactory: (gateway: ClienteGateway) =>
        new RemoverClienteUseCase(gateway),
      inject: [CLIENTE_GATEWAY],
    },
    {
      provide: AlterarStatusClienteUseCase,
      useFactory: (gateway: ClienteGateway) =>
        new AlterarStatusClienteUseCase(gateway),
      inject: [CLIENTE_GATEWAY],
    },
  ],
})
export class ClientesModule {}
