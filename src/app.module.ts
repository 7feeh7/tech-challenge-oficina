import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClientesModule } from './clientes/clientes.module';
import { ServicosModule } from './servicos/servicos.module';
import { VeiculosModule } from './veiculos/veiculos.module';
import { PrismaService } from './database/prisma.service';
import { PrismaModule } from './database/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { UsuariosModule } from './usuarios/usuarios.module';
import { PecasModule } from './pecas/pecas.module';
import { OrdensServicoModule } from './ordens-servico/ordens-servico.module';
import { OrcamentosModule } from './orcamentos/orcamentos.module';
import { MovimentacoesEstoqueModule } from './movimentacoes-estoque/movimentacoes-estoque.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
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
  ],
})
export class AppModule {}
