import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { Orcamento } from '../../domain/entities/orcamento.entity';
import { StatusOrcamento } from '../../domain/status-orcamento';
import { PrismaOrcamentoGateway } from './prisma-orcamento.gateway';

describe('PrismaOrcamentoGateway', () => {
  const prisma = {
    orcamento: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    ordemServico: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    historicoStatusOS: {
      create: jest.fn(),
    },
    movimentacaoEstoque: {
      create: jest.fn(),
    },
    peca: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const osMetrics = {
    recordOrcamentoGerado: jest.fn(),
    recordTransicao: jest.fn(),
  };
  const gateway = new PrismaOrcamentoGateway(
    prisma as never,
    osMetrics as never,
  );

  const orcamentoRaw = {
    id: 'orc-1',
    ordemServicoId: 'os-1',
    valorTotal: 100,
    status: 'AGUARDANDO_APROVACAO',
    observacoes: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('retorna null quando orçamento não existe', async () => {
    prisma.orcamento.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarPorId('ausente')).resolves.toBeNull();
  });

  it('lista com filtro de ordem de serviço', async () => {
    prisma.orcamento.findMany.mockResolvedValue([orcamentoRaw]);
    prisma.orcamento.count.mockResolvedValue(1);

    const pagina = await gateway.listar(1, 10, 'os-1');

    expect(pagina.total).toBe(1);
    expect(prisma.orcamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ordemServicoId: 'os-1' } }),
    );
  });

  it('lista sem filtro de ordem de serviço', async () => {
    prisma.orcamento.findMany.mockResolvedValue([]);
    prisma.orcamento.count.mockResolvedValue(0);

    await gateway.listar(1, 20);

    expect(prisma.orcamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('indica ausência de orçamento aguardando aprovação', async () => {
    prisma.orcamento.findFirst.mockResolvedValue(null);

    await expect(
      gateway.existeOrcamentoAguardandoAprovacao('os-1'),
    ).resolves.toBe(false);
  });

  it('indica existência de orçamento aguardando aprovação', async () => {
    prisma.orcamento.findFirst.mockResolvedValue({ id: 'orc-1' });

    await expect(
      gateway.existeOrcamentoAguardandoAprovacao('os-1'),
    ).resolves.toBe(true);
  });

  it('retorna null quando ordem vinculada não existe', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarOrdemComPecas('os-ausente')).resolves.toBeNull();
  });

  it('cria orçamento e transiciona OS em uma transação', async () => {
    const orcamento = new Orcamento({
      ordemServicoId: 'os-1',
      valorTotal: 100,
      status: StatusOrcamento.AGUARDANDO_APROVACAO,
    });

    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) =>
        Promise.resolve(
          fn({
            orcamento: {
              create: jest.fn().mockResolvedValue(orcamentoRaw),
            },
            ordemServico: {
              findUniqueOrThrow: jest.fn().mockResolvedValue({
                id: 'os-1',
                status: 'RECEBIDA',
                iniciadaEm: null,
              }),
              update: jest.fn().mockResolvedValue({
                id: 'os-1',
                status: 'AGUARDANDO_APROVACAO',
              }),
            },
            historicoStatusOS: {
              create: jest.fn().mockResolvedValue({}),
            },
          } as never),
        ),
    );

    const resultado = await gateway.criarEEnviarParaAprovacao(orcamento);

    expect(resultado.orcamento.id).toBe('orc-1');
    expect(resultado.transicao?.statusNovo).toBe(StatusOS.AGUARDANDO_APROVACAO);
  });
});
