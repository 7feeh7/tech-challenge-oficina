/**
 * Espera exponencial após falha de publicação (complemento E12).
 * `tentativas` é o valor já incrementado no registro.
 */
export function calcularEsperaRetentativaOutbox(
  tentativas: number,
  baseMs: number,
  tetoMs: number,
): number {
  if (tentativas <= 0 || baseMs <= 0) return 0;
  const expoente = Math.max(0, tentativas - 1);
  const fator = 2 ** expoente;
  return Math.min(tetoMs, baseMs * fator);
}

export function calcularBloqueadoAteRetentativaOutbox(
  tentativas: number,
  baseMs: number,
  tetoMs: number,
  agora: Date = new Date(),
): Date {
  const esperaMs = calcularEsperaRetentativaOutbox(tentativas, baseMs, tetoMs);
  return new Date(agora.getTime() + esperaMs);
}
