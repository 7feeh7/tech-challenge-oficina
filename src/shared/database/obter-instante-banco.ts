import { obterClienteTransacao } from './obter-cliente-transacao';
import type { ContextoTransacao } from './unit-of-work.port';
import { PrismaService } from './prisma.service';

/** Relógio do banco (D4.5) dentro da transação corrente. */
export async function obterInstanteBanco(
  contexto: ContextoTransacao,
  prisma: PrismaService,
): Promise<Date> {
  const cliente = obterClienteTransacao(contexto, prisma);
  const linhas = await cliente.$queryRaw<{ now: Date }[]>`
    SELECT NOW() AS now
  `;
  return linhas[0].now;
}
