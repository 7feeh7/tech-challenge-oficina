import { PrismaProjecaoFinanceiraGateway } from './prisma-projecao-financeira.gateway';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

describe('PrismaProjecaoFinanceiraGateway', () => {
  const prisma = {
    projecaoFinanceiraOs: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const gateway = new PrismaProjecaoFinanceiraGateway(prisma as never);

  it('retorna orderId principal', async () => {
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValue({ orderId: 'ORD' });
    await expect(
      gateway.buscarOrderIdPrincipal({} as never, 'os', 1),
    ).resolves.toBe('ORD');
  });

  it('atualiza link em pagamento duplicado sem link', async () => {
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce({
      id: 'x',
      linkPagamento: null,
    });
    await gateway.registrarPagamento({} as never, {
      ordemServicoId: 'os',
      rodada: 1,
      cobrancaId: null,
      orderId: 'ORD',
      valorCentavos: 1,
      linkPagamento: 'https://link',
      eventId: 'ev',
    });
    expect(prisma.projecaoFinanceiraOs.update).toHaveBeenCalled();
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

  it('registra orçamento idempotente', async () => {
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce(null);
    await expect(
      gateway.registrarOrcamento({} as never, {
        ordemServicoId: 'os',
        rodada: 1,
        orcamentoId: 'orc',
        valorTotalCentavos: 100,
        eventId: 'ev',
      }),
    ).resolves.toBe('criado');
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce({ id: 'x' });
    await expect(
      gateway.registrarOrcamento({} as never, {
        ordemServicoId: 'os',
        rodada: 1,
        orcamentoId: 'orc',
        valorTotalCentavos: 100,
        eventId: 'ev',
      }),
    ).resolves.toBe('duplicado');
  });

  it('detecta notificação de pagamento já enviada', async () => {
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce({
      linkPagamento: 'https://x',
    });
    await expect(
      gateway.jaNotificouPagamentoDisponivel({} as never, 'os', 1, 'ORD'),
    ).resolves.toBe(true);
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce({
      linkPagamento: null,
    });
    await expect(
      gateway.jaNotificouPagamentoDisponivel({} as never, 'os', 1, 'ORD'),
    ).resolves.toBe(false);
  });
});
