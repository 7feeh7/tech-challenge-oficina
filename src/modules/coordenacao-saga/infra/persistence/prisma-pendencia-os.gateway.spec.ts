import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import { PrismaPendenciaOsGateway } from './prisma-pendencia-os.gateway';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

describe('PrismaPendenciaOsGateway', () => {
  const montar = (linhasBloqueadas: { id: string }[]) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(linhasBloqueadas),
      pendenciaOs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          ordemServicoId: 'os-1',
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: false,
          detalhes: { natureza: 'SEGUNDO_PAGAMENTO' },
        }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ detalhes: { motivo: 'original', outra: 1 } }),
        update: jest.fn(),
      },
    };
    return { prisma, gateway: new PrismaPendenciaOsGateway(prisma as never) };
  };

  it('bloqueia e relê a pendência da OS', async () => {
    const { gateway, prisma } = montar([{ id: 'p1' }]);

    const pendencia = await gateway.bloquearDaOrdem({} as never, 'os-1', 'p1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(pendencia).toEqual({
      id: 'p1',
      ordemServicoId: 'os-1',
      tipo: TipoPendenciaOs.FINANCEIRA,
      resolvida: false,
      detalhes: { natureza: 'SEGUNDO_PAGAMENTO' },
    });
  });

  it('devolve null quando a pendência não existe na OS', async () => {
    const { gateway, prisma } = montar([]);

    await expect(
      gateway.bloquearDaOrdem({} as never, 'os-1', 'p1'),
    ).resolves.toBeNull();
    expect(prisma.pendenciaOs.findUnique).not.toHaveBeenCalled();
  });

  it('devolve null quando a pendência some entre o bloqueio e a leitura', async () => {
    const { gateway, prisma } = montar([{ id: 'p1' }]);
    prisma.pendenciaOs.findUnique.mockResolvedValue(null);

    await expect(
      gateway.bloquearDaOrdem({} as never, 'os-1', 'p1'),
    ).resolves.toBeNull();
  });

  it('grava a resolução preservando as chaves originais de detalhes', async () => {
    const { gateway, prisma } = montar([]);
    const resolvidaEm = new Date('2026-11-19T12:00:00.000Z');

    await gateway.registrarResolucaoManual({} as never, {
      pendenciaId: 'p1',
      responsavelId: 'admin-1',
      resolvidaEm,
      resolucaoManual: { motivo: 'novo' },
    });

    expect(prisma.pendenciaOs.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        resolvida: true,
        resolvidaPorId: 'admin-1',
        resolvidaEm,
        detalhes: {
          motivo: 'original',
          outra: 1,
          resolucaoManual: { motivo: 'novo' },
        },
      },
    });
  });
});
