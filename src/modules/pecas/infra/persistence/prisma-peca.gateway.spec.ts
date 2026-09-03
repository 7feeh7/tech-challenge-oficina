import { PrismaService } from '@/shared/database/prisma.service';
import { Peca } from '../../domain/entities/peca.entity';
import { PrismaPecaGateway } from './prisma-peca.gateway';

const prisma = {
  peca: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as PrismaService;

const db = prisma.peca as unknown as Record<string, jest.Mock>;

const raw = {
  id: 'p1',
  codigo: 'FLT-001',
  nome: 'Filtro de óleo',
  descricao: 'Filtro para motores 1.0 a 2.0',
  precoUnitario: '29.90', // o Prisma devolve Decimal; o mapper converte
  quantidadeEstoque: 10,
  estoqueMinimo: 2,
  ativo: true,
  criadoEm: new Date('2026-01-01'),
  atualizadoEm: new Date('2026-01-01'),
};

const peca = new Peca({ ...raw, precoUnitario: 29.9 });

describe('PrismaPecaGateway', () => {
  const gateway = new PrismaPecaGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('buscarPorId converte o Decimal do preço para number', async () => {
    db.findUnique.mockResolvedValue(raw);

    const encontrada = await gateway.buscarPorId('p1');

    expect(encontrada).toBeInstanceOf(Peca);
    expect(encontrada?.precoUnitario).toBe(29.9);
  });

  it('buscarPorId devolve null quando não encontra', async () => {
    db.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarPorId('x')).resolves.toBeNull();
  });

  it('existeComCodigo reflete a resposta do banco', async () => {
    db.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(gateway.existeComCodigo('FLT-001')).resolves.toBe(true);

    db.findUnique.mockResolvedValue(null);
    await expect(gateway.existeComCodigo('NOVO-1')).resolves.toBe(false);
  });

  it('codigoPertenceAOutraPeca exclui a própria peça da busca', async () => {
    db.findFirst.mockResolvedValue({ id: 'p2' });

    await expect(
      gateway.codigoPertenceAOutraPeca('p1', 'FLT-001'),
    ).resolves.toBe(true);

    expect(db.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: { not: 'p1' } }, { codigo: 'FLT-001' }] },
      select: { id: true },
    });
  });

  it('codigoPertenceAOutraPeca é falso quando o código está livre', async () => {
    db.findFirst.mockResolvedValue(null);

    await expect(gateway.codigoPertenceAOutraPeca('p1', 'LIVRE')).resolves.toBe(
      false,
    );
  });

  it('listar sem busca ordena por nome e não filtra', async () => {
    db.findMany.mockResolvedValue([raw]);
    db.count.mockResolvedValue(1);

    const pagina = await gateway.listar(1, 20);

    expect(pagina.total).toBe(1);
    expect(pagina.pecas[0]).toBeInstanceOf(Peca);
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { nome: 'asc' } }),
    );
  });

  it('listar com busca procura em nome e código', async () => {
    db.findMany.mockResolvedValue([]);
    db.count.mockResolvedValue(0);

    await gateway.listar(2, 20, 'filtro');

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { nome: { contains: 'filtro', mode: 'insensitive' } },
            { codigo: { contains: 'filtro', mode: 'insensitive' } },
          ],
        },
        skip: 20,
      }),
    );
  });

  it('criar persiste os campos do domínio', async () => {
    db.create.mockResolvedValue(raw);

    const criada = await gateway.criar(peca);

    expect(criada).toBeInstanceOf(Peca);
    expect(db.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigo: 'FLT-001', precoUnitario: 29.9 }),
    });
  });

  it('atualizar grava pelo id', async () => {
    db.update.mockResolvedValue(raw);

    await expect(gateway.atualizar('p1', peca)).resolves.toBeInstanceOf(Peca);
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' } }),
    );
  });

  it('remover apaga pelo id', async () => {
    db.delete.mockResolvedValue(raw);

    await gateway.remover('p1');

    expect(db.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
