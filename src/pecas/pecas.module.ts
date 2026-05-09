import { Module } from '@nestjs/common';
import { PecasController } from './pecas.controller';
import { PecasService } from './pecas.service';
import { PrismaModule } from '@/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PecasController],
  providers: [PecasService],
})
export class PecasModule {}
