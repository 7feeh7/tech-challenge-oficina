import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { StatusOS } from '../../domain/status-os';
import {
  ItemPecaOrdem,
  ItemServicoOrdem,
} from '../../domain/entities/item-ordem';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import { PrismaOrdemServicoGateway } from './prisma-ordem-servico.gateway';

describe('PrismaOrdemServicoGateway', () => {
  const prisma = {
    ordemServico: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    historicoStatusOS: {
      create: jest.fn(),
    },
    ordemServicoServico: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    ordemServicoPeca: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const gateway = new PrismaOrdemServicoGateway(prisma as never);
  const contexto = new PrismaContextoTransacao(prisma as never);

  const ordemPrisma = {
    id: 'os-1',
    numero: 1,
    status: 'RECEBIDA',
    rodadaVigente: 1,
    prioridadeFila: 6,
    correlationId: 'corr-1',
    clienteId: 'cliente-1',
    veiculoId: 'veiculo-1',
    descricaoProblema: 'problema',
    diagnostico: null,
    diagnosticoConcluidoEm: null,
    etapaOrigemCancelamento: null,
    motivoEncerramento: null,
    veiculoLiberadoRetirada: false,
    devolvidaEm: null,
    prazoReferenciaReserva: null,
    iniciadaEm: null,
    finalizadaEm: null,
    entregueEm: null,
    criadoEm: new Date('2026-01-01T10:00:00Z'),
    atualizadoEm: new Date('2026-01-01T10:00:00Z'),
    servicos: [],
    pecas: [],
    sugestoesItens: [],
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

  it('filtra listagem por status específico', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);
    prisma.ordemServico.count.mockResolvedValue(0);

    await gateway.listar(1, 5, StatusOS.FINALIZADA);

    expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: StatusOS.FINALIZADA },
      }),
    );
  });

  it('ordena a fila por prioridade persistida', async () => {
    prisma.ordemServico.findMany.mockResolvedValue([]);
    prisma.ordemServico.count.mockResolvedValue(0);

    await gateway.listar(1, 10);

    expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ prioridadeFila: 'asc' }, { criadoEm: 'asc' }],
      }),
    );
  });

  it('cria OS, sugestões e histórico na transação', async () => {
    const ordem = new OrdemServico({
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      correlationId: 'corr-1',
    });
    ordem.adicionarSugestao({
      tipo: 'SERVICO',
      itemId: 'serv-1',
      quantidade: 1,
    });

    prisma.ordemServico.create.mockResolvedValue(ordemPrisma);
    prisma.historicoStatusOS.create.mockResolvedValue({});

    const bloqueada = await gateway.criar(contexto, ordem, {
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
      rodada: 1,
      eventId: 'evt-1',
      ocorridoEm: new Date(),
    });

    expect(prisma.ordemServico.create).toHaveBeenCalled();
    expect(prisma.historicoStatusOS.create).toHaveBeenCalled();
    expect(bloqueada.ordem.id).toBe('os-1');
  });

  it('bloqueia a linha com FOR UPDATE antes de ler', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'os-1' }]);
    prisma.ordemServico.findUnique.mockResolvedValue(ordemPrisma);

    const bloqueada = await gateway.bloquearParaAtualizacao(contexto, 'os-1');

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(bloqueada?.ordem.id).toBe('os-1');
  });

  it('substitui itens oficiais quando sinalizado na entidade', async () => {
    const ordem = new OrdemServico({
      id: 'os-1',
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      status: StatusOS.EM_DIAGNOSTICO,
    });
    ordem.substituirItensOficiais(
      [
        new ItemServicoOrdem({
          servicoId: 's1',
          quantidade: 1,
          precoUnitario: 20,
        }),
      ],
      [
        new ItemPecaOrdem({
          pecaId: 'p1',
          quantidade: 1,
          precoUnitario: 10,
        }),
      ],
    );

    await gateway.salvar(contexto, ordem);

    expect(prisma.ordemServicoServico.deleteMany).toHaveBeenCalled();
    expect(prisma.ordemServicoPeca.deleteMany).toHaveBeenCalled();
  });

  it('retorna null ao bloquear OS inexistente', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      gateway.bloquearParaAtualizacao(contexto, 'ausente'),
    ).resolves.toBeNull();
  });

  it('monta detalhe com histórico quando solicitado', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({
      ...ordemPrisma,
      historicoStatus: [
        {
          id: 'h1',
          statusAnterior: 'RECEBIDA',
          statusNovo: 'EM_DIAGNOSTICO',
          rodada: 1,
          eventId: 'e1',
          motivo: null,
          observacao: 'Diag',
          alteradoPor: null,
          ocorridoEm: new Date(),
          criadoEm: new Date(),
        },
      ],
      orcamentos: [],
    });

    const detalhe = await gateway.buscarDetalhePorId('os-1');

    expect(detalhe?.historicoStatus).toHaveLength(1);
    expect(detalhe?.historicoStatus[0].statusNovo).toBe(
      StatusOS.EM_DIAGNOSTICO,
    );
  });

  it('acrescenta serviços oficiais incrementalmente', async () => {
    const ordem = new OrdemServico({
      id: 'os-1',
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      status: StatusOS.EM_DIAGNOSTICO,
    });
    ordem.adicionarServicoOficial(
      new ItemServicoOrdem({
        servicoId: 's2',
        quantidade: 1,
        precoUnitario: 99,
      }),
    );

    await gateway.salvar(contexto, ordem);

    expect(prisma.ordemServicoServico.createMany).toHaveBeenCalled();
  });

  it('acrescenta itens sem substituir quando não há flag', async () => {
    const ordem = new OrdemServico({
      id: 'os-1',
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      status: StatusOS.EM_DIAGNOSTICO,
    });
    ordem.adicionarPecaOficial(
      new ItemPecaOrdem({ pecaId: 'p2', quantidade: 1, precoUnitario: 5 }),
    );

    await gateway.salvar(contexto, ordem);

    expect(prisma.ordemServicoPeca.createMany).toHaveBeenCalled();
    expect(prisma.ordemServicoPeca.deleteMany).not.toHaveBeenCalled();
  });

  it('salva alterações e histórico opcional', async () => {
    const ordem = new OrdemServico({
      id: 'os-1',
      clienteId: 'cliente-1',
      veiculoId: 'veiculo-1',
      status: StatusOS.EM_DIAGNOSTICO,
    });

    await gateway.salvar(contexto, ordem, {
      statusAnterior: StatusOS.RECEBIDA,
      statusNovo: StatusOS.EM_DIAGNOSTICO,
      rodada: 1,
      eventId: 'evt-2',
      ocorridoEm: new Date(),
    });

    expect(prisma.ordemServico.update).toHaveBeenCalled();
    expect(prisma.historicoStatusOS.create).toHaveBeenCalled();
  });
});
