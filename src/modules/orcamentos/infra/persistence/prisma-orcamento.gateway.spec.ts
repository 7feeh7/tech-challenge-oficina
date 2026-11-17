import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { Orcamento } from '../../domain/entities/orcamento.entity';
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
      delete: jest.fn(),
    },
    ordemServico: {
      findUnique: jest.fn(),
    },
  };

  const gateway = new PrismaOrcamentoGateway(prisma as never);
  const contexto = new PrismaContextoTransacao(prisma as never);

  const orcamentoRaw = {
    id: 'orc-1',
    ordemServicoId: 'os-1',
    valorTotal: 100,
    status: 'AGUARDANDO_APROVACAO',
    observacoes: null,
    motivoRejeicao: null,
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
  });

  it('busca ordem com status, rodada e peças', async () => {
    prisma.ordemServico.findUnique.mockResolvedValue({
      id: 'os-1',
      status: StatusOS.EM_DIAGNOSTICO,
      rodadaVigente: 1,
      pecas: [{ pecaId: 'p1', quantidade: 2 }],
    });

    const ordem = await gateway.buscarOrdemParaOrcamento('os-1');

    expect(ordem).toMatchObject({
      id: 'os-1',
      status: StatusOS.EM_DIAGNOSTICO,
      rodadaVigente: 1,
      pecas: [{ pecaId: 'p1', quantidade: 2 }],
    });
  });

  it('detecta orçamento aguardando aprovação', async () => {
    prisma.orcamento.findFirst.mockResolvedValue({ id: 'orc-1' });

    await expect(
      gateway.existeOrcamentoAguardandoAprovacao('os-1'),
    ).resolves.toBe(true);
  });

  it('persiste orçamento no contexto da transação', async () => {
    const orcamento = new Orcamento({
      ordemServicoId: 'os-1',
      valorTotal: 200,
    });
    prisma.orcamento.create.mockResolvedValue(orcamentoRaw);

    await gateway.criar(contexto, orcamento);

    expect(prisma.orcamento.create).toHaveBeenCalled();
  });
});
