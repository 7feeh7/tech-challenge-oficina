import { PrismaService } from '@/shared/database/prisma.service';
import { PrismaCatalogoGateway } from './prisma-catalogo.gateway';

const prisma = {
  cliente: { findUnique: jest.fn() },
  veiculo: { findUnique: jest.fn() },
  servico: { findUnique: jest.fn() },
  peca: { findUnique: jest.fn() },
} as unknown as PrismaService;

const cliente = prisma.cliente.findUnique as unknown as jest.Mock;
const veiculo = prisma.veiculo.findUnique as unknown as jest.Mock;
const servico = prisma.servico.findUnique as unknown as jest.Mock;
const peca = prisma.peca.findUnique as unknown as jest.Mock;

describe('PrismaCatalogoGateway', () => {
  const gateway = new PrismaCatalogoGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('clienteExiste confirma pelo id', async () => {
    cliente.mockResolvedValue({ id: 'c1' });
    await expect(gateway.clienteExiste('c1')).resolves.toBe(true);

    cliente.mockResolvedValue(null);
    await expect(gateway.clienteExiste('x')).resolves.toBe(false);
  });

  it('buscarVeiculo devolve id e dono do veículo', async () => {
    veiculo.mockResolvedValue({ id: 'v1', clienteId: 'c1' });

    await expect(gateway.buscarVeiculo('v1')).resolves.toEqual({
      id: 'v1',
      clienteId: 'c1',
    });
  });

  it('buscarVeiculo devolve null quando o veículo não existe', async () => {
    veiculo.mockResolvedValue(null);

    await expect(gateway.buscarVeiculo('x')).resolves.toBeNull();
  });

  it('servicoExiste confirma pelo id sem ler o preço', async () => {
    servico.mockResolvedValue({ id: 's1' });
    await expect(gateway.servicoExiste('s1')).resolves.toBe(true);
    expect(servico).toHaveBeenCalledWith({
      where: { id: 's1' },
      select: { id: true },
    });

    servico.mockResolvedValue(null);
    await expect(gateway.servicoExiste('x')).resolves.toBe(false);
  });

  it('pecaExiste confirma pelo id sem ler o preço', async () => {
    peca.mockResolvedValue({ id: 'p1' });
    await expect(gateway.pecaExiste('p1')).resolves.toBe(true);

    peca.mockResolvedValue(null);
    await expect(gateway.pecaExiste('x')).resolves.toBe(false);
  });
});
