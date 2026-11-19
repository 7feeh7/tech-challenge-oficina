import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from './prisma.service';

/**
 * Transação curta com limite de execução no banco.
 *
 * O `timeout` do Prisma não interrompe uma consulta bloqueada (o rollback espera a
 * consulta terminar) e o driver pg não tem timeout de query. O `statement_timeout`
 * local à transação faz o PostgreSQL cancelar a consulta, inclusive a espera por
 * lock, e o erro devolve o controle ao chamador dentro de `limiteMs`.
 */
export function executarTransacaoComLimite<T>(
  prisma: PrismaService,
  limiteMs: number,
  trabalho: (cliente: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (cliente) => {
      await cliente.$queryRaw`SELECT set_config('statement_timeout', ${String(limiteMs)}, true)`;
      return trabalho(cliente);
    },
    { timeout: limiteMs },
  );
}
