import { consolidarItensQuantidade } from './consolidar-itens-quantidade';
import type { ContextoConsumoEstoque } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';

export interface ConteudoConsumoComparavel {
  eventId: string;
  tipoFato: string;
  fatoOcorridoEm: Date;
  concluidoEm?: Date | null;
  responsavelId?: string | null;
  motivo?: string | null;
  pecasUtilizadas: { itemId: string; quantidade: number }[];
  divergencias: {
    itemId: string;
    tipo?: string | null;
    quantidadePrevista?: number;
    quantidadeUtilizada?: number;
    justificativa?: string | null;
  }[];
}

function mesmoInstante(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < 1000;
}

function divergenciasEquivalentes(
  a: ConteudoConsumoComparavel['divergencias'],
  b: ConteudoConsumoComparavel['divergencias'],
): boolean {
  const norm = (lista: ConteudoConsumoComparavel['divergencias']): string[] =>
    [...lista]
      .map((d) => ({
        itemId: d.itemId,
        tipo: d.tipo ?? '',
        prev: d.quantidadePrevista ?? 0,
        util: d.quantidadeUtilizada ?? 0,
        just: d.justificativa ?? '',
      }))
      .sort((x, y) => x.itemId.localeCompare(y.itemId))
      .map((d) => `${d.itemId}|${d.tipo}|${d.prev}|${d.util}|${d.just}`);
  const la = norm(a);
  const lb = norm(b);
  return la.length === lb.length && la.every((v, i) => v === lb[i]);
}

export function conteudosConsumoSemanticamenteEquivalentes(
  a: ConteudoConsumoComparavel,
  b: ConteudoConsumoComparavel,
): boolean {
  if (a.eventId !== b.eventId) {
    return false;
  }
  if (a.tipoFato !== b.tipoFato) {
    return false;
  }
  if (!mesmoInstante(a.fatoOcorridoEm, b.fatoOcorridoEm)) {
    return false;
  }
  const conclA = a.concluidoEm?.getTime() ?? null;
  const conclB = b.concluidoEm?.getTime() ?? null;
  if (conclA !== conclB) {
    return false;
  }
  if ((a.responsavelId ?? null) !== (b.responsavelId ?? null)) {
    return false;
  }
  if (
    presenteMotivo(a.motivo) &&
    presenteMotivo(b.motivo) &&
    a.motivo !== b.motivo
  ) {
    return false;
  }
  const pecasA = consolidarItensQuantidade(a.pecasUtilizadas);
  const pecasB = consolidarItensQuantidade(b.pecasUtilizadas);
  if (pecasA.length !== pecasB.length) {
    return false;
  }
  for (let i = 0; i < pecasA.length; i++) {
    if (
      pecasA[i].itemId !== pecasB[i].itemId ||
      pecasA[i].quantidade !== pecasB[i].quantidade
    ) {
      return false;
    }
  }
  return divergenciasEquivalentes(a.divergencias, b.divergencias);
}

function presenteMotivo(m: string | null | undefined): boolean {
  return Boolean(m && String(m).trim());
}

export function deContextoConsumo(
  ctx: ContextoConsumoEstoque,
  pecas: { itemId: string; quantidade: number }[],
  divergencias: ConteudoConsumoComparavel['divergencias'],
  motivo?: string | null,
): ConteudoConsumoComparavel {
  return {
    eventId: ctx.eventId,
    tipoFato: ctx.tipoFato,
    fatoOcorridoEm: ctx.fatoOcorridoEm,
    concluidoEm: ctx.concluidoEm,
    responsavelId: ctx.responsavelId,
    motivo: motivo ?? null,
    pecasUtilizadas: pecas,
    divergencias,
  };
}
