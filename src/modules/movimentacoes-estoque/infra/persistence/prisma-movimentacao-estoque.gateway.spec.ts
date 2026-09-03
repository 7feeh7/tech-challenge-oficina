import { PrismaService } from '@/shared/database/prisma.service';
import { TipoMovimentacaoEstoque as TipoPrisma } from '@/shared/generated/prisma/enums';
import { MovimentacaoEstoque } from '../../domain/entities/movimentacao-estoque.entity';
import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';
import { PrismaMovimentacaoEstoqueGateway } from './prisma-movimentacao-estoque.gateway';

const prisma = {
  peca: { findUnique: jest.fn(), update: jest.fn() },
  movimentacaoEstoque: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
} as unknown as PrismaService;

const peca = prisma.peca as unknown as Record<string, jest.Mock>;
const mov = prisma.movimentacaoEstoque as unknown as Record<string, jest.Mock>;
const transaction = prisma.$transaction as unknown as jest.Mock;

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
  const gateway = new PrismaMovimentacaoEstoqueGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('buscarSaldoDaPeca devolve o saldo quando a peça existe', async () => {
    peca.findUnique.mockResolvedValue({ quantidadeEstoque: 10 });

    await expect(gateway.buscarSaldoDaPeca('p1')).resolves.toBe(10);
  });

  it('buscarSaldoDaPeca devolve null quando a peça não existe', async () => {
    peca.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarSaldoDaPeca('x')).resolves.toBeNull();
  });

  it('buscarComPecaPorId separa a movimentação do resumo da peça', async () => {
    mov.findUnique.mockResolvedValue(raw);

    const resultado = await gateway.buscarComPecaPorId('m1');

    expect(resultado?.movimentacao).toBeInstanceOf(MovimentacaoEstoque);
    expect(resultado?.movimentacao.quantidade).toBe(5);
    expect(resultado?.peca).toEqual(pecaResumo);
  });

  it('buscarComPecaPorId devolve null quando não encontra', async () => {
    mov.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarComPecaPorId('x')).resolves.toBeNull();
  });

  it('listar sem filtro de peça devolve tudo paginado', async () => {
    mov.findMany.mockResolvedValue([raw]);
    mov.count.mockResolvedValue(1);

    const pagina = await gateway.listar(1, 10);

    expect(pagina.total).toBe(1);
    expect(pagina.movimentacoes[0].movimentacao).toBeInstanceOf(
      MovimentacaoEstoque,
    );
    expect(mov.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0 }),
    );
  });

  it('listar com pecaId filtra pela peça', async () => {
    mov.findMany.mockResolvedValue([]);
    mov.count.mockResolvedValue(0);

    await gateway.listar(2, 10, 'p1');

    expect(mov.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pecaId: 'p1' }, skip: 10 }),
    );
  });

  it('registrar grava histórico e saldo na MESMA transação', async () => {
    // o $transaction recebe as duas operações e devolve os resultados em ordem
    transaction.mockResolvedValue([raw, { id: 'p1' }]);

    const movimentacao = new MovimentacaoEstoque({
      pecaId: 'p1',
      tipo: TipoMovimentacaoEstoque.ENTRADA,
      quantidade: 5,
    });

    const resultado = await gateway.registrar(movimentacao, 15);

    expect(resultado.movimentacao).toBeInstanceOf(MovimentacaoEstoque);
    expect(resultado.peca).toEqual(pecaResumo);

    // é isso que impede saldo e histórico de divergirem
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mov.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pecaId: 'p1', quantidade: 5 }),
      }),
    );
    expect(peca.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { quantidadeEstoque: 15 },
    });
  });
});
