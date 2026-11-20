export interface ItemQuantidade {
  itemId: string;
  quantidade: number;
}

export function consolidarItensQuantidade(
  itens: ItemQuantidade[],
): ItemQuantidade[] {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    if (!item.itemId || item.quantidade < 0) {
      continue;
    }
    mapa.set(item.itemId, (mapa.get(item.itemId) ?? 0) + item.quantidade);
  }
  return [...mapa.entries()]
    .map(([itemId, quantidade]) => ({ itemId, quantidade }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
}
