export const SCOPE_ESTOQUE_RESERVAR = 'estoque.reservar';
export const SCOPE_ESTOQUE_LIBERAR = 'estoque.liberar';
export const SCOPE_ESTOQUE_CONSUMIR = 'estoque.consumir';

export function hashCorpoEstoque(corpo: unknown): string {
  return JSON.stringify(corpo ?? {});
}
