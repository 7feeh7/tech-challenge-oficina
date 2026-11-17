import type {
  DivergenciaConsumoEfetivo,
  ItemConsumoEfetivo,
} from './divergencia-consumo-efetivo';
import { TipoDivergenciaConsumo } from './tipo-divergencia-consumo';
import { itemIdPecaEstruturalmenteValido } from './validar-item-id-peca-os';

export interface LinhaReservaConciliacao {
  pecaId: string;
  quantidadeReservada: number;
}

export interface ResultadoConciliacaoConsumo {
  itensAutomaticos: ItemConsumoEfetivo[];
  divergenciasInventario: DivergenciaConsumoEfetivo[];
  divergenciasAuditoria: DivergenciaConsumoEfetivo[];
}

function tipoInformativo(tipo?: string): boolean {
  return (
    tipo === TipoDivergenciaConsumo.CONSUMO_INFERIOR ||
    tipo === TipoDivergenciaConsumo.CONSUMO_ZERO
  );
}

function divergenciaExigePendencia(d: DivergenciaConsumoEfetivo): boolean {
  if (d.motivo?.includes('desconhecida') || d.motivo?.includes('inválido')) {
    return true;
  }
  if (d.quantidadeReservada === 0 && (d.quantidadeInformada ?? 0) > 0) {
    return true;
  }
  if (
    d.quantidadeReservada !== undefined &&
    d.quantidadeInformada !== undefined &&
    d.quantidadeInformada > d.quantidadeReservada
  ) {
    return true;
  }
  if (d.tipo && !tipoInformativo(d.tipo)) {
    return true;
  }
  if (!d.tipo && d.motivo) {
    return true;
  }
  return false;
}

/**
 * Conciliação autoritativa do OS: baixa só do reservado; pendência só quando o OS não conciliar.
 */
export function conciliarConsumoEfetivo(
  reservasAtivas: LinhaReservaConciliacao[],
  pecasUtilizadas: ItemConsumoEfetivo[],
  divergenciasFato: DivergenciaConsumoEfetivo[] = [],
  pecaExisteNoCatalogo: (pecaId: string) => boolean,
): ResultadoConciliacaoConsumo {
  const mapaReserva = new Map(
    reservasAtivas.map((l) => [l.pecaId, l.quantidadeReservada]),
  );
  const mapaUtilizado = new Map<string, number>();
  for (const item of pecasUtilizadas) {
    const atual = mapaUtilizado.get(item.itemId) ?? 0;
    mapaUtilizado.set(item.itemId, atual + item.quantidade);
  }

  const divergenciasAuditoria: DivergenciaConsumoEfetivo[] = [
    ...divergenciasFato.map((d) => ({ ...d })),
  ];
  const divergenciasInventario: DivergenciaConsumoEfetivo[] = [];
  const itensAutomaticos: ItemConsumoEfetivo[] = [];

  for (const [itemId, quantidade] of mapaUtilizado) {
    if (!itemIdPecaEstruturalmenteValido(itemId)) {
      const d: DivergenciaConsumoEfetivo = {
        itemId,
        quantidadePrevista: 0,
        quantidadeUtilizada: quantidade,
        quantidadeReservada: 0,
        quantidadeInformada: quantidade,
        motivo: 'Identificador de peça inválido ou peça desconhecida.',
      };
      divergenciasAuditoria.push(d);
      divergenciasInventario.push(d);
      continue;
    }

    const reservada = mapaReserva.get(itemId);
    if (reservada === undefined) {
      const tipoFato = divergenciasFato.find((x) => x.itemId === itemId)?.tipo;
      const d: DivergenciaConsumoEfetivo = {
        itemId,
        quantidadePrevista: 0,
        quantidadeUtilizada: quantidade,
        quantidadeReservada: 0,
        quantidadeInformada: quantidade,
        tipo: tipoFato ?? TipoDivergenciaConsumo.FORA_DA_LISTA,
        motivo: pecaExisteNoCatalogo(itemId)
          ? 'Peça do catálogo fora da reserva ativa.'
          : 'Peça desconhecida no catálogo.',
      };
      divergenciasAuditoria.push(d);
      divergenciasInventario.push(d);
      continue;
    }

    if (quantidade > reservada) {
      const d: DivergenciaConsumoEfetivo = {
        itemId,
        quantidadePrevista: reservada,
        quantidadeUtilizada: quantidade,
        quantidadeReservada: reservada,
        quantidadeInformada: quantidade,
        tipo: TipoDivergenciaConsumo.CONSUMO_ACIMA,
        motivo: 'Quantidade informada excede a reservada.',
      };
      divergenciasAuditoria.push(d);
      divergenciasInventario.push(d);
      itensAutomaticos.push({ itemId, quantidade: reservada });
      continue;
    }

    itensAutomaticos.push({ itemId, quantidade });
  }

  for (const [pecaId] of mapaReserva) {
    if (mapaUtilizado.has(pecaId)) {
      continue;
    }
    const tipoZero = divergenciasFato.find(
      (d) =>
        d.itemId === pecaId && d.tipo === TipoDivergenciaConsumo.CONSUMO_ZERO,
    );
    if (tipoZero) {
      divergenciasAuditoria.push({ ...tipoZero });
    }
  }

  const dedupInventario = divergenciasInventario.filter((d) =>
    divergenciaExigePendencia(d),
  );

  return {
    itensAutomaticos,
    divergenciasInventario: dedupInventario,
    divergenciasAuditoria,
  };
}
