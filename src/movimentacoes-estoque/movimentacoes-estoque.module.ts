import { Module } from '@nestjs/common';
import { MovimentacoesEstoqueController } from './movimentacoes-estoque.controller';
import { MovimentacoesEstoqueService } from './movimentacoes-estoque.service';
import { PrismaModule } from '@/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MovimentacoesEstoqueController],
  providers: [MovimentacoesEstoqueService],
})
export class MovimentacoesEstoqueModule {}
