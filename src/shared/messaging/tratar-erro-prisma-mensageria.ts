export function ehP2002MensagemProcessada(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') {
    return false;
  }
  const prisma = erro as { code?: string; meta?: { modelName?: string } };
  return (
    prisma.code === 'P2002' && prisma.meta?.modelName === 'MensagemProcessada'
  );
}
