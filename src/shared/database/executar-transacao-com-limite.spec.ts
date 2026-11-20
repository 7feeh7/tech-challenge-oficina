import { executarTransacaoComLimite } from './executar-transacao-com-limite';

describe('executarTransacaoComLimite', () => {
  const criarPrismaFake = () => {
    const cliente = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const prisma = {
      $transaction: jest.fn((trabalho: (tx: unknown) => Promise<unknown>) =>
        trabalho(cliente),
      ),
    };
    return { cliente, prisma };
  };

  it('define o statement_timeout local antes do trabalho e devolve o resultado', async () => {
    const { cliente, prisma } = criarPrismaFake();
    const ordem: string[] = [];
    cliente.$queryRaw.mockImplementation(() => {
      ordem.push('statement_timeout');
      return Promise.resolve([]);
    });

    const resultado = await executarTransacaoComLimite(
      prisma as never,
      1500,
      () => {
        ordem.push('trabalho');
        return Promise.resolve('ok');
      },
    );

    expect(resultado).toBe('ok');
    expect(ordem).toEqual(['statement_timeout', 'trabalho']);
    const [, valorLimite] = cliente.$queryRaw.mock.calls[0] as unknown[];
    expect(valorLimite).toBe('1500');
  });

  it('aplica o mesmo limite ao timeout da transação do Prisma', async () => {
    const { prisma } = criarPrismaFake();

    await executarTransacaoComLimite(prisma as never, 1500, () =>
      Promise.resolve(),
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 1500,
    });
  });

  it('propaga o erro do trabalho', async () => {
    const { prisma } = criarPrismaFake();

    await expect(
      executarTransacaoComLimite(prisma as never, 1500, () =>
        Promise.reject(new Error('falha')),
      ),
    ).rejects.toThrow('falha');
  });
});
