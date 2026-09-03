import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { ClienteConsultaGateway } from './application/ports/cliente-consulta.gateway';
import {
  CLIENTE_CONSULTA_GATEWAY,
  VEICULO_GATEWAY,
} from './application/ports/tokens';
import { VeiculoGateway } from './application/ports/veiculo.gateway';
import { AtualizarVeiculoUseCase } from './application/use-cases/atualizar-veiculo.use-case';
import { BuscarVeiculoUseCase } from './application/use-cases/buscar-veiculo.use-case';
import { CriarVeiculoUseCase } from './application/use-cases/criar-veiculo.use-case';
import { ListarVeiculosUseCase } from './application/use-cases/listar-veiculos.use-case';
import { RemoverVeiculoUseCase } from './application/use-cases/remover-veiculo.use-case';
import { VeiculosController } from './infra/http/controllers/veiculos.controller';
import { PrismaClienteConsultaGateway } from './infra/persistence/prisma-cliente-consulta.gateway';
import { PrismaVeiculoGateway } from './infra/persistence/prisma-veiculo.gateway';

/**
 * Wiring do módulo: liga as portas da camada de aplicação aos adaptadores de
 * infraestrutura. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 */
@Module({
  imports: [PrismaModule],
  controllers: [VeiculosController],
  providers: [
    PrismaVeiculoGateway,
    PrismaClienteConsultaGateway,
    { provide: VEICULO_GATEWAY, useExisting: PrismaVeiculoGateway },
    {
      provide: CLIENTE_CONSULTA_GATEWAY,
      useExisting: PrismaClienteConsultaGateway,
    },
    {
      provide: CriarVeiculoUseCase,
      useFactory: (
        veiculos: VeiculoGateway,
        clientes: ClienteConsultaGateway,
      ) => new CriarVeiculoUseCase(veiculos, clientes),
      inject: [VEICULO_GATEWAY, CLIENTE_CONSULTA_GATEWAY],
    },
    {
      provide: ListarVeiculosUseCase,
      useFactory: (veiculos: VeiculoGateway) =>
        new ListarVeiculosUseCase(veiculos),
      inject: [VEICULO_GATEWAY],
    },
    {
      provide: BuscarVeiculoUseCase,
      useFactory: (veiculos: VeiculoGateway) =>
        new BuscarVeiculoUseCase(veiculos),
      inject: [VEICULO_GATEWAY],
    },
    {
      provide: AtualizarVeiculoUseCase,
      useFactory: (
        veiculos: VeiculoGateway,
        clientes: ClienteConsultaGateway,
      ) => new AtualizarVeiculoUseCase(veiculos, clientes),
      inject: [VEICULO_GATEWAY, CLIENTE_CONSULTA_GATEWAY],
    },
    {
      provide: RemoverVeiculoUseCase,
      useFactory: (veiculos: VeiculoGateway) =>
        new RemoverVeiculoUseCase(veiculos),
      inject: [VEICULO_GATEWAY],
    },
  ],
})
export class VeiculosModule {}
