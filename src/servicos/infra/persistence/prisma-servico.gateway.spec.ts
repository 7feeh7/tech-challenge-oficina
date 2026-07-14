import { PrismaService } from '@/database/prisma.service';
import { Servico } from '../../domain/entities/servico.entity';
import { PrismaServicoGateway } from './prisma-servico.gateway';

const prisma = {
  servico: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as PrismaService;

const db = prisma.servico as unknown as Record<string, jest.Mock>;

const raw = {
  id: 's1',
  nome: 'Troca de óleo',
  descricao: 'Troca de óleo do motor com filtro',
  precoBase: '150.00', // Decimal do Prisma
  tempoEstimadoMin: 60,
  ativo: true,
  criadoEm: new Date('2026-01-01'),
  atualizadoEm: new Date('2026-01-01'),
};

const servico = new Servico({ ...raw, precoBase: 150 });

describe('PrismaServicoGateway', () => {
  const gateway = new PrismaServicoGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('buscarPorId converte o Decimal do preço para number', async () => {
    db.findUnique.mockResolvedValue(raw);

    const encontrado = await gateway.buscarPorId('s1');

    expect(encontrado).toBeInstanceOf(Servico);
    expect(encontrado?.precoBase).toBe(150);
  });

  it('buscarPorId devolve null quando não encontra', async () => {
    db.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarPorId('x')).resolves.toBeNull();
  });

  it('existeComNome reflete a resposta do banco', async () => {
    db.findUnique.mockResolvedValue({ id: 's1' });
    await expect(gateway.existeComNome('Troca de óleo')).resolves.toBe(true);

    db.findUnique.mockResolvedValue(null);
    await expect(gateway.existeComNome('Alinhamento')).resolves.toBe(false);
  });

  it('nomePertenceAOutroServico exclui o próprio serviço da busca', async () => {
    db.findFirst.mockResolvedValue({ id: 's2' });

    await expect(
      gateway.nomePertenceAOutroServico('s1', 'Troca de óleo'),
    ).resolves.toBe(true);

    expect(db.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: { not: 's1' } }, { nome: 'Troca de óleo' }] },
      select: { id: true },
    });
  });

  it('nomePertenceAOutroServico é falso quando o nome está livre', async () => {
    db.findFirst.mockResolvedValue(null);

    await expect(
      gateway.nomePertenceAOutroServico('s1', 'Livre'),
    ).resolves.toBe(false);
  });

  it('listar sem busca não filtra', async () => {
    db.findMany.mockResolvedValue([raw]);
    db.count.mockResolvedValue(1);

    const pagina = await gateway.listar(1, 10);

    expect(pagina.total).toBe(1);
    expect(pagina.servicos[0]).toBeInstanceOf(Servico);
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { nome: 'asc' } }),
    );
  });

  it('listar com busca filtra por nome', async () => {
    db.findMany.mockResolvedValue([]);
    db.count.mockResolvedValue(0);

    await gateway.listar(2, 10, 'óleo');

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nome: { contains: 'óleo', mode: 'insensitive' } },
        skip: 10,
      }),
    );
  });

  it('criar persiste os campos do domínio', async () => {
    db.create.mockResolvedValue(raw);

    const criado = await gateway.criar(servico);

    expect(criado).toBeInstanceOf(Servico);
    expect(db.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nome: 'Troca de óleo',
        precoBase: 150,
      }),
    });
  });

  it('atualizar grava pelo id', async () => {
    db.update.mockResolvedValue(raw);

    await expect(gateway.atualizar('s1', servico)).resolves.toBeInstanceOf(
      Servico,
    );
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
  });

  it('remover apaga pelo id', async () => {
    db.delete.mockResolvedValue(raw);

    await gateway.remover('s1');

    expect(db.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});
