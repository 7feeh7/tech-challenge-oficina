import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DomainExceptionFilter } from './shared/filters/domain-exception.filter';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ServicosModule } from './modules/servicos/servicos.module';
import { VeiculosModule } from './modules/veiculos/veiculos.module';
import { PrismaService } from './shared/database/prisma.service';
import { PrismaModule } from './shared/database/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { PecasModule } from './modules/pecas/pecas.module';
import { OrdensServicoModule } from './modules/ordens-servico/ordens-servico.module';
import { OrcamentosModule } from './modules/orcamentos/orcamentos.module';
import { MovimentacoesEstoqueModule } from './modules/movimentacoes-estoque/movimentacoes-estoque.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { OwnershipGuard } from './modules/auth/guards/ownership.guard';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
    HealthModule,
    ClientesModule,
    ServicosModule,
    VeiculosModule,
    PrismaModule,
    UsuariosModule,
    PecasModule,
    OrdensServicoModule,
    OrcamentosModule,
    MovimentacoesEstoqueModule,
  ],
  controllers: [],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OwnershipGuard,
    },
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
  ],
})
export class AppModule {}
