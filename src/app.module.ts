import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
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
  providers: [PrismaService],
})
export class AppModule {}
