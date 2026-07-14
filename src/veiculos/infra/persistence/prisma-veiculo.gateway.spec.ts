import { PrismaService } from '@/database/prisma.service';
import { Veiculo } from '../../domain/entities/veiculo.entity';
import { PrismaVeiculoGateway } from './prisma-veiculo.gateway';

const prisma = {
  veiculo: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as PrismaService;

const db = prisma.veiculo as unknown as Record<string, jest.Mock>;

const raw = {
  id: 'v1',
  placa: 'ABC1D23',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2023,
  clienteId: 'c1',
  criadoEm: new Date('2026-01-01'),
  atualizadoEm: new Date('2026-01-01'),
};

const veiculo = new Veiculo(raw);

describe('PrismaVeiculoGateway', () => {
  const gateway = new PrismaVeiculoGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('buscarPorId devolve a entidade quando encontra', async () => {
    db.findUnique.mockResolvedValue(raw);

    const encontrado = await gateway.buscarPorId('v1');

    expect(encontrado).toBeInstanceOf(Veiculo);
    expect(encontrado?.placa).toBe('ABC1D23');
  });

  it('buscarPorId devolve null quando não encontra', async () => {
    db.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarPorId('x')).resolves.toBeNull();
  });

  it('buscarComClientePorId separa o veículo do cliente', async () => {
    db.findUnique.mockResolvedValue({
      ...raw,
      cliente: { id: 'c1', nome: 'João Silva' },
    });

    const resultado = await gateway.buscarComClientePorId('v1');

    expect(resultado?.veiculo).toBeInstanceOf(Veiculo);
    expect(resultado?.cliente).toEqual({ id: 'c1', nome: 'João Silva' });
  });

  it('buscarComClientePorId devolve null quando não encontra', async () => {
    db.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarComClientePorId('x')).resolves.toBeNull();
  });

  it('existeComPlaca reflete o que o banco respondeu', async () => {
    db.findUnique.mockResolvedValue({ id: 'v1' });
    await expect(gateway.existeComPlaca('ABC1D23')).resolves.toBe(true);

    db.findUnique.mockResolvedValue(null);
    await expect(gateway.existeComPlaca('XYZ9K88')).resolves.toBe(false);
  });

  it('placaPertenceAOutroVeiculo exclui o próprio id da busca', async () => {
    db.findFirst.mockResolvedValue({ id: 'v2' });

    await expect(
      gateway.placaPertenceAOutroVeiculo('v1', 'ABC1D23'),
    ).resolves.toBe(true);

    expect(db.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: { not: 'v1' } }, { placa: 'ABC1D23' }] },
      select: { id: true },
    });
  });

  it('placaPertenceAOutroVeiculo é falso quando a placa está livre', async () => {
    db.findFirst.mockResolvedValue(null);

    await expect(
      gateway.placaPertenceAOutroVeiculo('v1', 'XYZ9K88'),
    ).resolves.toBe(false);
  });

  it('listar sem busca não aplica filtro', async () => {
    db.findMany.mockResolvedValue([raw]);
    db.count.mockResolvedValue(1);

    const pagina = await gateway.listar(1, 5);

    expect(pagina.total).toBe(1);
    expect(pagina.veiculos[0]).toBeInstanceOf(Veiculo);
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 5 }),
    );
  });

  it('listar com busca procura em placa, modelo e marca', async () => {
    db.findMany.mockResolvedValue([]);
    db.count.mockResolvedValue(0);

    await gateway.listar(3, 5, 'corolla');

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { placa: { contains: 'corolla', mode: 'insensitive' } },
            { modelo: { contains: 'corolla', mode: 'insensitive' } },
            { marca: { contains: 'corolla', mode: 'insensitive' } },
          ],
        },
        skip: 10,
      }),
    );
  });

  it('criar persiste os campos do domínio', async () => {
    db.create.mockResolvedValue(raw);

    const criado = await gateway.criar(veiculo);

    expect(criado).toBeInstanceOf(Veiculo);
    expect(db.create).toHaveBeenCalledWith({
      data: {
        placa: 'ABC1D23',
        marca: 'Toyota',
        modelo: 'Corolla',
        ano: 2023,
        clienteId: 'c1',
      },
    });
  });

  it('atualizar grava pelo id', async () => {
    db.update.mockResolvedValue(raw);

    await expect(gateway.atualizar('v1', veiculo)).resolves.toBeInstanceOf(
      Veiculo,
    );
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1' } }),
    );
  });

  it('remover apaga pelo id', async () => {
    db.delete.mockResolvedValue(raw);

    await gateway.remover('v1');

    expect(db.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
  });
});
