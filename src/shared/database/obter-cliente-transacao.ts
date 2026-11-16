import type { Prisma } from '../generated/prisma/client';
import { ContextoTransacaoInvalidoError } from './contexto-transacao-invalido.error';
import type { PrismaService } from './prisma.service';
import { PrismaContextoTransacao } from './prisma-contexto-transacao';
import {
  type ContextoTransacao,
  ContextoTransacaoMarca,
} from './unit-of-work.port';

export function obterClienteTransacao(
  contexto: ContextoTransacao | undefined,
  prisma: PrismaService,
): Prisma.TransactionClient | PrismaService {
  if (contexto === undefined) {
    return prisma;
  }
  if (contexto instanceof PrismaContextoTransacao) {
    return contexto.cliente;
  }
  if (ContextoTransacaoMarca in contexto) {
    throw new ContextoTransacaoInvalidoError();
  }
  throw new ContextoTransacaoInvalidoError();
}
