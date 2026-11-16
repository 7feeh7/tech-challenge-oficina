import { obterClienteTransacao } from './obter-cliente-transacao';
import { PrismaContextoTransacao } from './prisma-contexto-transacao';
import { ContextoTransacaoMarca } from './unit-of-work.port';

describe('obterClienteTransacao', () => {
  it('usa cliente da transação quando contexto é PrismaContextoTransacao', () => {
    const tx = { marca: 'tx' };
    const contexto = new PrismaContextoTransacao(tx as never);
    const prisma = { marca: 'prisma' };

    expect(obterClienteTransacao(contexto, prisma as never)).toBe(tx);
  });

  it('usa Prisma raiz quando contexto é undefined', () => {
    const prisma = { marca: 'prisma' };
    expect(obterClienteTransacao(undefined, prisma as never)).toBe(prisma);
  });

  it('falha quando contexto tem marca mas não é PrismaContextoTransacao', () => {
    const prisma = { marca: 'prisma' };
    const contexto = { [ContextoTransacaoMarca]: undefined };

    expect(() => obterClienteTransacao(contexto, prisma as never)).toThrow(
      'Contexto de transação inválido',
    );
  });
});
