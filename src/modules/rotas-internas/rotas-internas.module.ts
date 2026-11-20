import { Module } from '@nestjs/common';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { IdempotencyService } from '@/shared/idempotency/idempotency.service';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { ClientesModule } from '@/modules/clientes/clientes.module';
import { CLIENTE_GATEWAY } from '@/modules/clientes/application/ports/tokens';
import type { ClienteGateway } from '@/modules/clientes/application/ports/cliente.gateway';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ORDEM_SERVICO_GATEWAY } from '@/modules/ordens-servico/application/ports/tokens';
import { CATALOGO_GATEWAY } from '@/modules/ordens-servico/application/ports/tokens';
import type { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import type { CatalogoGateway } from '@/modules/ordens-servico/application/ports/catalogo.gateway';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import { TokenChamadorInternoGuard } from './guards/token-chamador-interno.guard';
import { IdempotencyKeyInternaGuard } from './guards/idempotency-key-interna.guard';
import { ConcluirDiagnosticoInternoUseCase } from './application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from './application/use-cases/reservar-os-interno.use-case';
import { BuscarClienteCpfInternoUseCase } from './application/use-cases/buscar-cliente-cpf-interno.use-case';
import { RotasInternasOrdensController } from './infra/http/controllers/rotas-internas-ordens.controller';
import { RotasInternasClientesController } from './infra/http/controllers/rotas-internas-clientes.controller';
@Module({
  imports: [
    PrismaModule,
    IdempotencyModule,
    ClientesModule,
    OrdensServicoModule,
    ReservasEstoqueModule,
  ],
  controllers: [RotasInternasOrdensController, RotasInternasClientesController],
  providers: [
    TokenChamadorInternoGuard,
    IdempotencyKeyInternaGuard,
    {
      provide: ConcluirDiagnosticoInternoUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        catalogo: CatalogoGateway,
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
        idempotency: IdempotencyService,
        prisma: PrismaService,
      ) =>
        new ConcluirDiagnosticoInternoUseCase(
          ordens,
          catalogo,
          unitOfWork,
          transicoes,
          idempotency,
          prisma,
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        CATALOGO_GATEWAY,
        UNIT_OF_WORK,
        TransicaoOrdemServicoService,
        IdempotencyService,
        PrismaService,
      ],
    },
    {
      provide: ReservarOsInternoUseCase,
      useFactory: (
        ordens: OrdemServicoGateway,
        unitOfWork: UnitOfWork,
        transicoes: TransicaoOrdemServicoService,
        reservar: ReservarEstoqueUseCase,
        idempotency: IdempotencyService,
        prisma: PrismaService,
      ) =>
        new ReservarOsInternoUseCase(
          ordens,
          unitOfWork,
          transicoes,
          reservar,
          idempotency,
          prisma,
        ),
      inject: [
        ORDEM_SERVICO_GATEWAY,
        UNIT_OF_WORK,
        TransicaoOrdemServicoService,
        ReservarEstoqueUseCase,
        IdempotencyService,
        PrismaService,
      ],
    },
    {
      provide: BuscarClienteCpfInternoUseCase,
      useFactory: (clientes: ClienteGateway) =>
        new BuscarClienteCpfInternoUseCase(clientes),
      inject: [CLIENTE_GATEWAY],
    },
  ],
  exports: [TokenChamadorInternoGuard, IdempotencyKeyInternaGuard],
})
export class RotasInternasModule {}
