import { PrismaService } from '@/database/prisma.service';
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

  it('buscarPrecoDoServico converte o Decimal para number', async () => {
    servico.mockResolvedValue({ precoBase: '150.00' });

    await expect(gateway.buscarPrecoDoServico('s1')).resolves.toBe(150);
  });

  it('buscarPrecoDoServico devolve null quando o serviço não existe', async () => {
    servico.mockResolvedValue(null);

    await expect(gateway.buscarPrecoDoServico('x')).resolves.toBeNull();
  });

  it('buscarPrecoDaPeca converte o Decimal para number', async () => {
    peca.mockResolvedValue({ precoUnitario: '29.90' });

    await expect(gateway.buscarPrecoDaPeca('p1')).resolves.toBe(29.9);
  });

  it('buscarPrecoDaPeca devolve null quando a peça não existe', async () => {
    peca.mockResolvedValue(null);

    await expect(gateway.buscarPrecoDaPeca('x')).resolves.toBeNull();
  });
});
