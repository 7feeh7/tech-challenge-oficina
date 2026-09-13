import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import { HealthController } from './health.controller';

const prisma = { $queryRaw: jest.fn() } as unknown as PrismaService;

describe('HealthController', () => {
  const controller = new HealthController(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('liveness responde sem tocar no banco', () => {
    expect(controller.liveness()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('readiness confirma que o banco responde', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.readiness()).resolves.toEqual({
      status: 'ok',
    });
  });

  it('readiness devolve 503 quando o banco está fora', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(
      new Error('connection refused'),
    );

    // o pod sai do Service e para de receber tráfego — mas não é morto
    await expect(controller.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
