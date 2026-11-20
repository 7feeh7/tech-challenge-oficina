import { ConfigService } from '@nestjs/config';
import type { NestContainer } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { exigirDatabaseUrl } from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

// Envolve o adaptador real para contar os pools criados: cada `PrismaService`
// cria o seu próprio pool, e o orçamento de conexões da D5.5 prevê um por pod.
jest.mock('@prisma/adapter-pg', () => {
  const real = jest.requireActual('@prisma/adapter-pg');
  return {
    ...real,
    PrismaPg: jest.fn(
      (...argumentos: unknown[]) => new real.PrismaPg(...argumentos),
    ),
  };
});

describe('PrismaService único na aplicação (integração)', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    exigirDatabaseUrl();
    modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    await fecharModuloIntegracao(modulo);
  });

  const provedoresDoContainer = () => {
    const container = (modulo as unknown as { container: NestContainer })
      .container;
    return [...container.getModules().values()].flatMap((moduloNest) => [
      ...moduloNest.providers.values(),
    ]);
  };

  it('registra uma única instância de PrismaService no container', () => {
    const instancias = provedoresDoContainer().filter(
      (provedor) => provedor.metatype === PrismaService,
    );

    expect(instancias).toHaveLength(1);
  });

  it('entrega a mesma instância a todos os consumidores', () => {
    const unica = modulo.get(PrismaService, { strict: false });
    const clientesPrisma = (instancia: object) =>
      Object.values(instancia).filter(
        (valor) =>
          typeof valor === 'object' && valor?.constructor === unica.constructor,
      );
    const consumidores = provedoresDoContainer().filter(
      (provedor) =>
        provedor.metatype !== PrismaService &&
        provedor.instance &&
        clientesPrisma(provedor.instance).length > 0,
    );

    // Gateways, serviços da saga, casos de uso e health check dependem do banco.
    expect(consumidores.length).toBeGreaterThan(10);
    for (const consumidor of consumidores) {
      const recebidas = clientesPrisma(consumidor.instance as object);
      expect(recebidas.every((recebida) => recebida === unica)).toBe(true);
    }
  });

  it('cria um único pool de conexões, com o tamanho configurado', () => {
    const config = modulo.get(ConfigService, { strict: false });
    const poolMaximo = Number(config.get<string>('DATABASE_POOL_MAX') ?? '5');

    expect(PrismaPg).toHaveBeenCalledTimes(1);
    expect(PrismaPg).toHaveBeenCalledWith(
      expect.objectContaining({ max: poolMaximo }),
    );
  });
});
