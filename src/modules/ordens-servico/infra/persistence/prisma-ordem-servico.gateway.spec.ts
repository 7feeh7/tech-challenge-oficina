import { StatusOS } from '../../domain/status-os';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import { PrismaOrdemServicoGateway } from './prisma-ordem-servico.gateway';

describe('PrismaOrdemServicoGateway', () => {
  const prisma = {
    ordemServico: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const osMetrics = {
    recordOsCriada: jest.fn(),
    recordTransicao: jest.fn(),
  };

  const gateway = new PrismaOrdemServicoGateway(
    prisma as never,
    osMetrics as never,
  );

  const ordemPrisma = {
    id: 'os-1',
    numero: 1,
    status: 'RECEBIDA',
    clienteId: 'cliente-1',
    veiculoId: 'veiculo-1',
    descricaoProblema: 'problema',
    diagnostico: null,
    iniciadaEm: null,
    finalizadaEm: null,
    entregueEm: null,
    criadoEm: new Date('2026-01-01T10:00:00Z'),
    atualizadoEm: new Date('2026-01-01T10:00:00Z'),
    servicos: [],
    pecas: [],
    cliente: {
      id: 'cliente-1',
      nome: 'Cliente',
      email: 'c@x.com',
      telefone: '1',
    },
    veiculo: {
      id: 'veiculo-1',
      placa: 'ABC1D23',
      marca: 'Marca',
      modelo: 'Modelo',
      ano: 2024,
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('retorna null quando OS não existe', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarPorId('ausente')).resolves.toBeNull();
  });

  it('lista fila aberta sem filtro de status', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([
      {
        ...ordemPrisma,
        cliente: { id: 'cliente-1', nome: 'Cliente' },
        veiculo: { id: 'veiculo-1', placa: 'ABC1D23', modelo: 'Modelo' },
      },
    ]);
    prisma.ordemServico.count.mockResolvedValue(1);

    const pagina = await gateway.listar(1, 10);

    expect(pagina.total).toBe(1);
    expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: expect.any(Object) }),
      }),
    );
  });

  it('lista com status específico', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);
    prisma.ordemServico.count.mockResolvedValue(0);

    await gateway.listar(2, 5, StatusOS.EM_DIAGNOSTICO);

    expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it('consulta marcos de tempo com janela opcional', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);

    await gateway.buscarMarcosDeTempo(
      new Date('2026-01-01'),
      new Date('2026-02-01'),
    );

    expect(prisma.ordemServico.findMany).toHaveBeenCalledWith({
      where: {
        criadoEm: {
          gte: new Date('2026-01-01'),
          lte: new Date('2026-02-01'),
        },
      },
      select: {
        criadoEm: true,
        iniciadaEm: true,
        finalizadaEm: true,
        entregueEm: true,
      },
    });
  });

  it('cria OS e registra métrica', async () => {
    const ordem = new OrdemServico({
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      descricaoProblema: 'falha',
    });

    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) =>
        Promise.resolve(
          fn({
            ordemServico: {
              create: jest.fn().mockResolvedValue(ordemPrisma),
            },
            historicoStatusOS: {
              create: jest.fn().mockResolvedValue({}),
            },
          } as never),
        ),
    );

    const detalhe = await gateway.criar(ordem, {
      statusNovo: StatusOS.RECEBIDA,
      observacao: 'abertura',
    });

    expect(detalhe.ordem.id).toBe('os-1');
    expect(osMetrics.recordOsCriada).toHaveBeenCalled();
  });

  it('atualiza OS e registra transição quando houver status anterior', async () => {
    const ordem = new OrdemServico({
      id: 'os-1',
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      status: StatusOS.EM_DIAGNOSTICO,
    });

    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) =>
        Promise.resolve(
          fn({
            ordemServico: {
              update: jest.fn().mockResolvedValue({
                ...ordemPrisma,
                status: 'EM_DIAGNOSTICO',
              }),
            },
            historicoStatusOS: {
              create: jest.fn().mockResolvedValue({}),
            },
          } as never),
        ),
    );

    await gateway.atualizar('os-1', ordem, {
      statusAnterior: StatusOS.RECEBIDA,
      statusNovo: StatusOS.EM_DIAGNOSTICO,
      observacao: 'diagnóstico',
    });

    expect(osMetrics.recordTransicao).toHaveBeenCalledWith(
      'os-1',
      StatusOS.RECEBIDA,
    );
  });

  it('retorna null no detalhe quando OS não existe', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarDetalhePorId('ausente')).resolves.toBeNull();
  });

  it('atualiza sem histórico quando registro não é informado', async () => {
    const ordem = new OrdemServico({
      id: 'os-1',
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      descricaoProblema: 'ajuste',
    });

    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) =>
        Promise.resolve(
          fn({
            ordemServico: {
              update: jest.fn().mockResolvedValue(ordemPrisma),
            },
            historicoStatusOS: {
              create: jest.fn(),
            },
          } as never),
        ),
    );

    await gateway.atualizar('os-1', ordem);

    expect(osMetrics.recordTransicao).not.toHaveBeenCalled();
  });

  it('busca marcos sem filtro de datas', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);

    await gateway.buscarMarcosDeTempo();

    expect(prisma.ordemServico.findMany).toHaveBeenCalledWith({
      where: {},
      select: expect.any(Object),
    });
  });

  it('remove OS por id', async () => {
    prisma.ordemServico.delete.mockResolvedValue({});

    await gateway.remover('os-1');

    expect(prisma.ordemServico.delete).toHaveBeenCalledWith({
      where: { id: 'os-1' },
    });
  });
});
