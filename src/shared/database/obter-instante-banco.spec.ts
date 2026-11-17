import { obterInstanteBanco } from './obter-instante-banco';
import { PrismaContextoTransacao } from './prisma-contexto-transacao';

describe('obterInstanteBanco', () => {
  it('lê NOW() do PostgreSQL na transação', async () => {
    const instante = new Date('2026-02-01T12:00:00Z');
    const cliente = {
      $queryRaw: jest.fn().mockResolvedValue([{ now: instante }]),
    };
    const prisma = {} as never;
    const contexto = new PrismaContextoTransacao(cliente as never);
    await expect(obterInstanteBanco(contexto, prisma)).resolves.toEqual(
      instante,
    );
  });
});
