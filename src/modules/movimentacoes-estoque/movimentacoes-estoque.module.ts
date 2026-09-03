import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { MovimentacaoEstoqueGateway } from './application/ports/movimentacao-estoque.gateway';
import { MOVIMENTACAO_ESTOQUE_GATEWAY } from './application/ports/tokens';
import { BuscarMovimentacaoUseCase } from './application/use-cases/buscar-movimentacao.use-case';
import { ListarMovimentacoesUseCase } from './application/use-cases/listar-movimentacoes.use-case';
import { RegistrarMovimentacaoUseCase } from './application/use-cases/registrar-movimentacao.use-case';
import { MovimentacoesEstoqueController } from './infra/http/controllers/movimentacoes-estoque.controller';
import { PrismaMovimentacaoEstoqueGateway } from './infra/persistence/prisma-movimentacao-estoque.gateway';

/**
 * Wiring do módulo: liga a porta da camada de aplicação ao adaptador de
 * persistência. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MovimentacoesEstoqueController],
  providers: [
    PrismaMovimentacaoEstoqueGateway,
    {
      provide: MOVIMENTACAO_ESTOQUE_GATEWAY,
      useExisting: PrismaMovimentacaoEstoqueGateway,
    },
    {
      provide: RegistrarMovimentacaoUseCase,
      useFactory: (gateway: MovimentacaoEstoqueGateway) =>
        new RegistrarMovimentacaoUseCase(gateway),
      inject: [MOVIMENTACAO_ESTOQUE_GATEWAY],
    },
    {
      provide: ListarMovimentacoesUseCase,
      useFactory: (gateway: MovimentacaoEstoqueGateway) =>
        new ListarMovimentacoesUseCase(gateway),
      inject: [MOVIMENTACAO_ESTOQUE_GATEWAY],
    },
    {
      provide: BuscarMovimentacaoUseCase,
      useFactory: (gateway: MovimentacaoEstoqueGateway) =>
        new BuscarMovimentacaoUseCase(gateway),
      inject: [MOVIMENTACAO_ESTOQUE_GATEWAY],
    },
  ],
})
export class MovimentacoesEstoqueModule {}
