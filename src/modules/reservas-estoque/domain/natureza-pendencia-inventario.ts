/** Discriminadores em `pendencias_os.detalhes.natureza` (complemento E42). */
export const NATUREZA_PENDENCIA_INFORMACAO_INSUFICIENTE =
  'INFORMACAO_INSUFICIENTE';
export const NATUREZA_PENDENCIA_CONFLITO_CONSUMO = 'CONFLITO_CONSUMO';
export const NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO = 'DIVERGENCIA_CONSUMO';

export function naturezaPendenciaInventario(
  detalhes: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!detalhes || typeof detalhes !== 'object') {
    return undefined;
  }
  const natureza = detalhes.natureza;
  if (typeof natureza === 'string' && natureza.length > 0) {
    return natureza;
  }
  if (
    Array.isArray(detalhes.divergencias) &&
    detalhes.divergencias.length > 0
  ) {
    return NATUREZA_PENDENCIA_DIVERGENCIA_CONSUMO;
  }
  return undefined;
}
