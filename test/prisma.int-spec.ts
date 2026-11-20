import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('PrismaService (integração)', () => {
  let prisma: PrismaService;
  let module: TestingModule;

  beforeAll(async () => {
    exigirDatabaseUrl();

    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
    }).compile();

    prisma = module.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
  });

  afterAll(async () => {
    await fecharModuloIntegracao(module);
  });

  it('conecta e executa SELECT 1', async () => {
    const rows = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 as one`;
    expect(rows[0]?.one).toBe(1);
  });
});
