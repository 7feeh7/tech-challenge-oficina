import { PrismaService } from '@/database/prisma.service';
import { PrismaClienteConsultaGateway } from './prisma-cliente-consulta.gateway';

const prisma = {
  cliente: { findUnique: jest.fn() },
} as unknown as PrismaService;

const findUnique = prisma.cliente.findUnique as unknown as jest.Mock;

describe('PrismaClienteConsultaGateway', () => {
  const gateway = new PrismaClienteConsultaGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('confirma que o cliente existe, buscando só o id', async () => {
    findUnique.mockResolvedValue({ id: 'c1' });

    await expect(gateway.existe('c1')).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'c1' },
      select: { id: true },
    });
  });

  it('é falso quando o cliente não existe', async () => {
    findUnique.mockResolvedValue(null);

    await expect(gateway.existe('inexistente')).resolves.toBe(false);
  });
});
