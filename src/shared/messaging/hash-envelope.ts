import { createHash } from 'node:crypto';

export function hashEnvelope(conteudo: unknown): string {
  return createHash('sha256').update(JSON.stringify(conteudo)).digest('hex');
}
