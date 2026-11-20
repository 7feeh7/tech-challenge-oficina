import { PrismaProjecaoFinanceiraGateway } from './prisma-projecao-financeira.gateway';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

describe('PrismaProjecaoFinanceiraGateway', () => {
  const prisma = {
    projecaoFinanceiraOs: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const gateway = new PrismaProjecaoFinanceiraGateway(prisma as never);

  it('lista só as orders com pagamento confirmado, sem o prefixo', async () => {
    prisma.projecaoFinanceiraOs.findMany.mockResolvedValue([
      { orderId: 'confirmado:ORD' },
    ]);
    await expect(
      gateway.buscarOrdersPagas({} as never, 'os', 1),
    ).resolves.toEqual(['ORD']);
    expect(prisma.projecaoFinanceiraOs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ordemServicoId: 'os', rodada: 1, natureza: 'CONFIRMACAO' },
      }),
    );
  });

  it('atualiza link em pagamento duplicado sem link', async () => {
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce({
      id: 'x',
      linkPagamento: null,
    });
    await gateway.registrarCobranca({} as never, {
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

  it('registra cobrança idempotente sem marcá-la como paga', async () => {
    prisma.projecaoFinanceiraOs.create.mockClear();
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce(null);
    await expect(
      gateway.registrarCobranca({} as never, {
        ordemServicoId: 'os',
        rodada: 1,
        cobrancaId: null,
        orderId: 'ORD',
        valorCentavos: 1,
        eventId: 'ev',
      }),
    ).resolves.toBe('criado');
    expect(prisma.projecaoFinanceiraOs.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.projecaoFinanceiraOs.create.mock.calls[0][0].data,
    ).toMatchObject({
      natureza: 'PAGAMENTO',
      orderId: 'ORD',
    });
    prisma.projecaoFinanceiraOs.findFirst.mockResolvedValueOnce({ id: 'x' });
    await expect(
      gateway.registrarCobranca({} as never, {
        ordemServicoId: 'os',
        rodada: 1,
        cobrancaId: null,
        orderId: 'ORD',
        valorCentavos: 1,
        eventId: 'ev',
      }),
    ).resolves.toBe('duplicado');
  });

  it('registra o pagamento como linha de confirmação, uma vez por order', async () => {
    prisma.projecaoFinanceiraOs.create.mockClear();
    const entrada = {
      ordemServicoId: 'os',
      rodada: 1,
      cobrancaId: null,
      orderId: 'ORD',
      valorCentavos: 1,
      eventId: 'ev',
    };
    prisma.projecaoFinanceiraOs.findFirst
      .mockResolvedValueOnce({ id: 'order-existente', linkPagamento: null })
      .mockResolvedValueOnce(null);
    await expect(
      gateway.registrarPagamento({} as never, entrada),
    ).resolves.toBe('criado');
    expect(prisma.projecaoFinanceiraOs.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.projecaoFinanceiraOs.create.mock.calls[0][0].data,
    ).toMatchObject({
      natureza: 'CONFIRMACAO',
      orderId: 'confirmado:ORD',
    });

    prisma.projecaoFinanceiraOs.findFirst
      .mockResolvedValueOnce({ id: 'order-existente', linkPagamento: null })
      .mockResolvedValueOnce({ id: 'confirmacao' });
    await expect(
      gateway.registrarPagamento({} as never, entrada),
    ).resolves.toBe('duplicado');
    expect(prisma.projecaoFinanceiraOs.create).toHaveBeenCalledTimes(1);
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
