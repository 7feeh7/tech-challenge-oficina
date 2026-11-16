import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from './prisma.service';

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../generated/prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    $connect = jest.fn();
    $disconnect = jest.fn();
  },
}));

const PrismaPgMock = PrismaPg as jest.Mock;

function criarConfig(valores: Record<string, string>): ConfigService {
  return {
    get: jest.fn((chave: string) => valores[chave]),
    getOrThrow: jest.fn((chave: string) => {
      const valor = valores[chave];
      if (valor === undefined) {
        throw new Error(`Config ausente: ${chave}`);
      }
      return valor;
    }),
  } as unknown as ConfigService;
}

describe('PrismaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('configura pool explícito no PrismaPg a partir das variáveis de ambiente', () => {
    const config = criarConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/oficina?schema=public',
      DATABASE_SSL: 'false',
      DATABASE_POOL_MAX: '5',
      DATABASE_POOL_CONNECTION_TIMEOUT_MS: '10000',
    });

    new PrismaService(config);

    expect(PrismaPgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString:
          'postgresql://u:p@localhost:5432/oficina?schema=public',
        max: 5,
        connectionTimeoutMillis: 10_000,
      }),
    );
  });

  it('habilita TLS no adapter quando DATABASE_SSL=true', () => {
    const config = criarConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/oficina?schema=public',
      DATABASE_SSL: 'true',
    });

    new PrismaService(config);

    expect(PrismaPgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: false },
      }),
    );
  });

  it('conecta e desconecta no ciclo de vida do módulo', async () => {
    const config = criarConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/oficina?schema=public',
    });
    const service = new PrismaService(config);
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect((service as { $connect: jest.Mock }).$connect).toHaveBeenCalled();
    expect(
      (service as { $disconnect: jest.Mock }).$disconnect,
    ).toHaveBeenCalled();
  });

  it('usa defaults do orçamento inicial quando variáveis de pool estão ausentes', () => {
    const config = criarConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/oficina?schema=public',
    });

    new PrismaService(config);

    expect(PrismaPgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 5,
        connectionTimeoutMillis: 10_000,
      }),
    );
  });
});
