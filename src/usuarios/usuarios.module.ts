import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { AdminSeedService } from './admin-seed.service';
import { PrismaModule } from '@/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, AdminSeedService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
