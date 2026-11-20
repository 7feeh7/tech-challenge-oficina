import { Global, Module } from '@nestjs/common';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { PrismaService } from './prisma.service';
import { UNIT_OF_WORK } from './unit-of-work.port';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaUnitOfWork,
    { provide: UNIT_OF_WORK, useExisting: PrismaUnitOfWork },
  ],
  exports: [PrismaService, UNIT_OF_WORK],
})
export class PrismaModule {}
