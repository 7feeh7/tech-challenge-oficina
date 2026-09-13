import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const HEADER = 'x-correlation-id';

interface CorrelationContext {
  correlationId: string;
}

export const correlationIdStorage = new AsyncLocalStorage<CorrelationContext>();

export function getCorrelationId(): string {
  return correlationIdStorage.getStore()?.correlationId ?? randomUUID();
}

export function extractCorrelationId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const incoming = headers[HEADER] ?? headers['X-Correlation-Id'];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value?.trim() || randomUUID();
}
