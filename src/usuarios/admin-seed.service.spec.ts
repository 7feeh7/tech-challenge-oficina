import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { AdminSeedService } from './admin-seed.service';

const prisma = {
  usuario: { findFirst: jest.fn(), create: jest.fn() },
} as unknown as PrismaService;

const config = {
  get: jest.fn((chave: string) => `valor-${chave}`),
} as unknown as ConfigService;

const findFirst = prisma.usuario.findFirst as jest.Mock;
const create = prisma.usuario.create as jest.Mock;

describe('AdminSeedService', () => {
  const service = new AdminSeedService(prisma, config);

  beforeEach(() => jest.clearAllMocks());

  it('não cria nada quando já existe um administrador', async () => {
    findFirst.mockResolvedValue({ id: 'admin-existente' });

    await service.onModuleInit();

    expect(create).not.toHaveBeenCalled();
  });

  it('cria o administrador inicial quando o banco está vazio', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'novo-admin' });

    await service.onModuleInit();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('ignora a violação de e-mail duplicado quando outra réplica cria o admin primeiro', async () => {
    // Com várias réplicas subindo juntas, todas passam pelo findFirst antes de
    // qualquer insert. Quem perde a corrida recebe P2002 — e não pode quebrar o
    // bootstrap, senão o pod entra em CrashLoopBackOff.
    findFirst.mockResolvedValue(null);
    create.mockRejectedValue(
      Object.assign(new Error('duplicado'), {
        code: 'P2002',
      }),
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('propaga erros que não sejam de duplicidade', async () => {
    findFirst.mockResolvedValue(null);
    create.mockRejectedValue(new Error('connection refused'));

    await expect(service.onModuleInit()).rejects.toThrow('connection refused');
  });
});
