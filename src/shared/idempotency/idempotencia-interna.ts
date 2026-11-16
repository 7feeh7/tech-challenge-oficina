/** Rotas internas só persistem resultado idempotente para 2xx (D2.12). */
export function devePersistirResultadoIdempotente(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}
