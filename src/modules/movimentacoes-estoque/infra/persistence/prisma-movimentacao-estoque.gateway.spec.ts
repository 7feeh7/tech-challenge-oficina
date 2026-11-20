import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import { TipoMovimentacaoEstoque as TipoPrisma } from '@/shared/generated/prisma/enums';
import { EstoqueInsuficienteError } from '../../domain/errors/movimentacao-estoque.errors';
import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';
import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';
import { PrismaMovimentacaoEstoqueGateway } from './prisma-movimentacao-estoque.gateway';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: PrismaService) => prisma,
}));

const cliente = {
  peca: { findUnique: jest.fn(), update: jest.fn() },
  movimentacaoEstoque: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
} as unknown as PrismaService;

const peca = cliente.peca as unknown as Record<string, jest.Mock>;
const mov = cliente.movimentacaoEstoque as unknown as Record<string, jest.Mock>;
const queryRaw = cliente.$queryRaw as unknown as jest.Mock;
const executeRaw = cliente.$executeRaw as unknown as jest.Mock;

const pecaResumo = { id: 'p1', codigo: 'FLT-001', nome: 'Filtro de óleo' };

const raw = {
  id: 'm1',
  pecaId: 'p1',
  tipo: TipoPrisma.ENTRADA,
  quantidade: 5,
  ordemServicoId: null,
  observacao: null,
  criadoEm: new Date('2026-01-01'),
  peca: pecaResumo,
};

describe('PrismaMovimentacaoEstoqueGateway', () => {
  const gateway = new PrismaMovimentacaoEstoqueGateway(cliente);
  const contexto = new PrismaContextoTransacao(cliente);

  beforeEach(() => jest.clearAllMocks());

  it('buscarSaldosDaPeca devolve físico, reservado e disponível', async () => {
    peca.findUnique.mockResolvedValue({
      quantidadeEstoque: 10,
      quantidadeReservada: 2,
    });

    await expect(gateway.buscarSaldosDaPeca('p1')).resolves.toEqual({
      quantidadeFisica: 10,
      quantidadeReservada: 2,
      quantidadeDisponivel: 8,
    });
  });

  it('buscarComPecaPorId retorna null quando não existe', async () => {
    mov.findUnique.mockResolvedValue(null);
    await expect(gateway.buscarComPecaPorId('x')).resolves.toBeNull();
  });

  it('registrar entrada aplica UPDATE relativo sob bloqueio', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 0,
        codigo: 'FLT-001',
        nome: 'Filtro',
      },
    ]);
    executeRaw.mockResolvedValue(1);
    mov.create.mockResolvedValue(raw);

    const movimentacao = new MovimentacaoEstoque({
      pecaId: 'p1',
      tipo: TipoMovimentacaoEstoque.ENTRADA,
      quantidade: 5,
    });

    const resultado = await gateway.registrar(contexto, movimentacao);

    expect(executeRaw).toHaveBeenCalled();
    expect(mov.create).toHaveBeenCalled();
    expect(resultado.movimentacao).toBeInstanceOf(MovimentacaoEstoque);
  });

  it('registrar baixa aplica UPDATE condicional ao disponível', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 3,
        codigo: 'FLT-001',
        nome: 'Filtro',
      },
    ]);
    executeRaw.mockResolvedValue(1);
    mov.create.mockResolvedValue(raw);

    const movimentacao = new MovimentacaoEstoque({
      pecaId: 'p1',
      tipo: TipoMovimentacaoEstoque.BAIXA,
      quantidade: 5,
    });

    await gateway.registrar(contexto, movimentacao);

    expect(executeRaw).toHaveBeenCalled();
  });

  it('registrar recusa peça inexistente após bloqueio', async () => {
    queryRaw.mockResolvedValue([]);

    const movimentacao = new MovimentacaoEstoque({
      pecaId: 'p1',
      tipo: TipoMovimentacaoEstoque.ENTRADA,
      quantidade: 1,
    });

    await expect(gateway.registrar(contexto, movimentacao)).rejects.toThrow(
      'não encontrada',
    );
  });

  it('registrar baixa insuficiente recusa antes de gravar histórico', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 5,
        quantidade_reservada: 4,
        codigo: 'FLT-001',
        nome: 'Filtro',
      },
    ]);

    const movimentacao = new MovimentacaoEstoque({
      pecaId: 'p1',
      tipo: TipoMovimentacaoEstoque.BAIXA,
      quantidade: 3,
    });

    await expect(gateway.registrar(contexto, movimentacao)).rejects.toThrow(
      EstoqueInsuficienteError,
    );
    expect(mov.create).not.toHaveBeenCalled();
  });

  it('listar com filtro por peça', async () => {
    mov.findMany.mockResolvedValue([]);
    mov.count.mockResolvedValue(0);

    await gateway.listar(1, 10, 'p1');

    expect(mov.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pecaId: 'p1' } }),
    );
  });
});
