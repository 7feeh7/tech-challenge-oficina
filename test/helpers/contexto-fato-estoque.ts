import { randomUUID } from 'node:crypto';

export function contextoFatoIntegracao(
  pecas: { itemId: string; quantidade: number }[],
  tipoFato:
    | 'REPARO_CONCLUIDO'
    | 'REPARO_FALHOU'
    | 'REPARO_INTERROMPIDO' = 'REPARO_CONCLUIDO',
  eventId = randomUUID(),
) {
  return {
    eventId,
    fatoOcorridoEm: new Date('2026-06-01T10:00:00.000Z'),
    tipoFato,
    consumoEfetivo: pecas,
    concluidoEm:
      tipoFato === 'REPARO_CONCLUIDO'
        ? new Date('2026-06-01T10:00:00.000Z')
        : null,
  };
}
