import { PrismaService } from '@/shared/database/prisma.service';
import { Cliente } from '../../domain/entities/cliente.entity';
import { PrismaClienteGateway } from './prisma-cliente.gateway';

const prisma = {
  cliente: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as PrismaService;

const db = prisma.cliente as unknown as Record<string, jest.Mock>;

const raw = {
  id: 'c1',
  nome: 'João Silva',
  cpfCnpj: '52998224725',
  email: 'joao@email.com',
  telefone: '11988887777',
  criadoEm: new Date('2026-01-01'),
  atualizadoEm: new Date('2026-01-01'),
};

const cliente = new Cliente(raw);

describe('PrismaClienteGateway', () => {
  const gateway = new PrismaClienteGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  describe('buscarPorId', () => {
    it('devolve a entidade de domínio quando encontra', async () => {
      db.findUnique.mockResolvedValue(raw);

      const encontrado = await gateway.buscarPorId('c1');

      expect(encontrado).toBeInstanceOf(Cliente);
      expect(encontrado?.email).toBe('joao@email.com');
      expect(db.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('devolve null quando não encontra', async () => {
      db.findUnique.mockResolvedValue(null);

      await expect(gateway.buscarPorId('inexistente')).resolves.toBeNull();
    });
  });

  describe('buscarComVeiculosPorId', () => {
    it('separa o cliente dos veículos e devolve só os campos do resumo', async () => {
      db.findUnique.mockResolvedValue({
        ...raw,
        veiculos: [
          {
            id: 'v1',
            placa: 'ABC1D23',
            marca: 'Toyota',
            modelo: 'Corolla',
            ano: 2023,
            clienteId: 'c1',
            criadoEm: new Date(),
          },
        ],
      });

      const resultado = await gateway.buscarComVeiculosPorId('c1');

      expect(resultado?.cliente).toBeInstanceOf(Cliente);
      // o gateway projeta apenas o resumo do veículo, sem clienteId nem datas
      expect(resultado?.veiculos).toEqual([
        {
          id: 'v1',
          placa: 'ABC1D23',
          marca: 'Toyota',
          modelo: 'Corolla',
          ano: 2023,
        },
      ]);
    });

    it('devolve null quando não encontra', async () => {
      db.findUnique.mockResolvedValue(null);

      await expect(gateway.buscarComVeiculosPorId('x')).resolves.toBeNull();
    });
  });

  describe('existeComEmailOuDocumento', () => {
    it('é verdadeiro quando o Prisma encontra alguém', async () => {
      db.findFirst.mockResolvedValue({ id: 'c1' });

      await expect(
        gateway.existeComEmailOuDocumento('joao@email.com', '52998224725'),
      ).resolves.toBe(true);
    });

    it('é falso quando não encontra ninguém', async () => {
      db.findFirst.mockResolvedValue(null);

      await expect(
        gateway.existeComEmailOuDocumento('novo@email.com', '11144477735'),
      ).resolves.toBe(false);
    });
  });

  describe('contatoPertenceAOutroCliente', () => {
    it('não consulta o banco quando não há e-mail nem documento', async () => {
      await expect(
        gateway.contatoPertenceAOutroCliente('c1', {}),
      ).resolves.toBe(false);
      expect(db.findFirst).not.toHaveBeenCalled();
    });

    it('procura excluindo o próprio cliente', async () => {
      db.findFirst.mockResolvedValue({ id: 'c2' });

      await expect(
        gateway.contatoPertenceAOutroCliente('c1', {
          email: 'joao@email.com',
        }),
      ).resolves.toBe(true);

      expect(db.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [{ id: { not: 'c1' } }, { OR: [{ email: 'joao@email.com' }] }],
        },
        select: { id: true },
      });
    });

    it('monta a busca com os dois critérios quando ambos vêm preenchidos', async () => {
      db.findFirst.mockResolvedValue(null);

      await expect(
        gateway.contatoPertenceAOutroCliente('c1', {
          email: 'joao@email.com',
          cpfCnpj: '52998224725',
        }),
      ).resolves.toBe(false);

      expect(db.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: { not: 'c1' } },
            {
              OR: [{ email: 'joao@email.com' }, { cpfCnpj: '52998224725' }],
            },
          ],
        },
        select: { id: true },
      });
    });
  });

  describe('listar', () => {
    it('pagina sem filtro quando não há busca', async () => {
      db.findMany.mockResolvedValue([raw]);
      db.count.mockResolvedValue(1);

      const pagina = await gateway.listar(2, 10);

      expect(pagina.total).toBe(1);
      expect(pagina.clientes[0]).toBeInstanceOf(Cliente);
      expect(db.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 10, take: 10 }),
      );
    });

    it('filtra por nome, sem diferenciar maiúsculas, quando há busca', async () => {
      db.findMany.mockResolvedValue([]);
      db.count.mockResolvedValue(0);

      await gateway.listar(1, 10, 'joão');

      expect(db.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { nome: { contains: 'joão', mode: 'insensitive' } },
          skip: 0,
        }),
      );
    });
  });

  it('criar persiste e devolve a entidade', async () => {
    db.create.mockResolvedValue(raw);

    const criado = await gateway.criar(cliente);

    expect(criado).toBeInstanceOf(Cliente);
    expect(db.create).toHaveBeenCalledWith({
      data: {
        nome: 'João Silva',
        cpfCnpj: '52998224725',
        email: 'joao@email.com',
        telefone: '11988887777',
      },
    });
  });

  it('atualizar grava pelo id e devolve a entidade', async () => {
    db.update.mockResolvedValue(raw);

    const atualizado = await gateway.atualizar('c1', cliente);

    expect(atualizado).toBeInstanceOf(Cliente);
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' } }),
    );
  });

  it('remover apaga pelo id', async () => {
    db.delete.mockResolvedValue(raw);

    await gateway.remover('c1');

    expect(db.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
