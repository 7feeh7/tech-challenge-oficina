import type { Prisma } from '../generated/prisma/client';
import {
  type ContextoTransacao,
  ContextoTransacaoMarca,
} from './unit-of-work.port';

export class PrismaContextoTransacao implements ContextoTransacao {
  readonly [ContextoTransacaoMarca] = undefined;

  constructor(readonly cliente: Prisma.TransactionClient) {}
}
