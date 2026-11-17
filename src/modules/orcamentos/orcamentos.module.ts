import { Module } from '@nestjs/common';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { PrismaModule } from '@/shared/database/prisma.module';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import { OrcamentoGateway } from './application/ports/orcamento.gateway';
import { ORCAMENTO_GATEWAY } from './application/ports/tokens';
import { AtualizarOrcamentoUseCase } from './application/use-cases/atualizar-orcamento.use-case';
import { BuscarOrcamentoUseCase } from './application/use-cases/buscar-orcamento.use-case';
import { CriarOrcamentoUseCase } from './application/use-cases/criar-orcamento.use-case';
import { ListarOrcamentosUseCase } from './application/use-cases/listar-orcamentos.use-case';
import { RemoverOrcamentoUseCase } from './application/use-cases/remover-orcamento.use-case';
import { OrcamentosController } from './infra/http/controllers/orcamentos.controller';
import { PrismaOrcamentoGateway } from './infra/persistence/prisma-orcamento.gateway';

@Module({
  imports: [PrismaModule, OrdensServicoModule, ReservasEstoqueModule],
  controllers: [OrcamentosController],
  providers: [
    PrismaOrcamentoGateway,
    { provide: ORCAMENTO_GATEWAY, useExisting: PrismaOrcamentoGateway },
    {
      provide: CriarOrcamentoUseCase,
      useFactory: (
        gateway: OrcamentoGateway,
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
      ) => new CriarOrcamentoUseCase(gateway, unitOfWork, transicoes),
      inject: [ORCAMENTO_GATEWAY, UNIT_OF_WORK, TransicaoOrdemServicoService],
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
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
        reservarEstoque: ReservarEstoqueUseCase,
      ) =>
        new AtualizarOrcamentoUseCase(
          gateway,
          unitOfWork,
          transicoes,
          reservarEstoque,
        ),
      inject: [
        ORCAMENTO_GATEWAY,
        UNIT_OF_WORK,
        TransicaoOrdemServicoService,
        ReservarEstoqueUseCase,
      ],
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
