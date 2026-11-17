import { PrismaConsultaPrazoOrdemGateway } from './prisma-consulta-prazo-ordem.gateway';

describe('PrismaConsultaPrazoOrdemGateway', () => {
  it('reivindica linhas elegíveis via transação', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'os-1' }]),
          ordemServico: { updateMany: jest.fn() },
        }),
      ),
    };
    const gateway = new PrismaConsultaPrazoOrdemGateway(prisma as never);
    await expect(gateway.reivindicarElegiveis(5, 1000)).resolves.toEqual([
      'os-1',
    ]);
  });
});