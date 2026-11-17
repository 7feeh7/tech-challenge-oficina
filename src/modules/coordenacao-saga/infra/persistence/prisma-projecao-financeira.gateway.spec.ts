import { PrismaProjecaoFinanceiraGateway } from './prisma-projecao-financeira.gateway';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

describe('PrismaProjecaoFinanceiraGateway', () => {
  const prisma = {
    projecaoFinanceiraOs: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const gateway = new PrismaProjecaoFinanceiraGateway(prisma as never);

  it('retorna orderId principal', async () => {
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValue({ orderId: 'ORD' });
    await expect(
      gateway.buscarOrderIdPrincipal({} as never, 'os', 1),
    ).resolves.toBe('ORD');
  });

  it('registra pagamento idempotente', async () => {
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce(null);
    await expect(
      gateway.registrarPagamento({} as never, {
        ordemServicoId: 'os',
        rodada: 1,
        cobrancaId: null,
        orderId: 'ORD',
        valorCentavos: 1,
        eventId: 'ev',
      }),
    ).resolves.toBe('criado');
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce({ id: 'x' });
    await expect(
      gateway.registrarPagamento({} as never, {
        ordemServicoId: 'os',
        rodada: 1,
        cobrancaId: null,
        orderId: 'ORD',
        valorCentavos: 1,
        eventId: 'ev',
      }),
    ).resolves.toBe('duplicado');
  });
});
