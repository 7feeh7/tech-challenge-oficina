import { ReservaDuplicadaInternaError } from '../domain/erros-internos';

export function ehP2002ReservaEstoque(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const prisma = erro as { code?: string; meta?: { modelName?: string } };
  return prisma.code === 'P2002' && prisma.meta?.modelName === 'ReservaEstoque';
}

export function ehP2002Idempotencia(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const prisma = erro as { code?: string; meta?: { modelName?: string } };
  return (
    prisma.code === 'P2002' && prisma.meta?.modelName === 'IdempotencyRecord'
  );
}

export function traduzirErroPrismaInterno(erro: unknown): never {
  if (ehP2002ReservaEstoque(erro)) {
    throw new ReservaDuplicadaInternaError();
  }
  throw erro;
}
