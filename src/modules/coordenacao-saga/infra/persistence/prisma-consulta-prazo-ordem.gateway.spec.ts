import { PrismaConsultaPrazoOrdemGateway } from './prisma-consulta-prazo-ordem.gateway';

describe('PrismaConsultaPrazoOrdemGateway', () => {
  const criarPrismaFake = (linhasElegiveis: { id: string }[]) => {
    const cliente = {
      $queryRaw: jest.fn().mockResolvedValue(linhasElegiveis),
      $executeRaw: jest.fn().mockResolvedValue(linhasElegiveis.length),
    };
    const prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(cliente)),
    };
    return { cliente, prisma };
  };

  it('reivindica linhas elegíveis via transação', async () => {
    const { prisma } = criarPrismaFake([{ id: 'os-1' }]);
    const gateway = new PrismaConsultaPrazoOrdemGateway(prisma as never);
    await expect(gateway.reivindicarElegiveis(5, 1000)).resolves.toEqual([
      'os-1',
    ]);
  });

  it('limita a transação de reivindicação a 5000 ms', async () => {
    const { prisma } = criarPrismaFake([]);
    const gateway = new PrismaConsultaPrazoOrdemGateway(prisma as never);

    await gateway.reivindicarElegiveis(5, 1000);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 5000,
    });
  });

  it('não grava posse quando nenhuma OS está elegível', async () => {
    const { cliente, prisma } = criarPrismaFake([]);
    const gateway = new PrismaConsultaPrazoOrdemGateway(prisma as never);

    await expect(gateway.reivindicarElegiveis(5, 1000)).resolves.toEqual([]);

    expect(cliente.$executeRaw).not.toHaveBeenCalled();
  });

  it('grava a posse pelo relógio do banco e só nas OS reivindicadas', async () => {
    const { cliente, prisma } = criarPrismaFake([
      { id: 'os-1' },
      { id: 'os-2' },
    ]);
    const gateway = new PrismaConsultaPrazoOrdemGateway(prisma as never);

    await gateway.reivindicarElegiveis(5, 150_000);

    const [sql, posseMs, ids] = cliente.$executeRaw.mock.calls[0] as [
      string[],
      number,
      string[],
    ];
    expect(sql.join('')).toContain('NOW() + ');
    expect(posseMs).toBe(150_000);
    expect(ids).toEqual(['os-1', 'os-2']);
  });
});
