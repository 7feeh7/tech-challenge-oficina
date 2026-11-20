import { timingSafeEqual } from 'node:crypto';

/** Compara tokens em tempo constante (D6.5). */
export function compararTokenSeguro(
  recebido: string,
  esperado: string,
): boolean {
  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
