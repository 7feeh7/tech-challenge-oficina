import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const CORRELATION_HEADER = 'x-correlation-id';
const REQUEST_HEADER = 'x-request-id';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ObservabilityContext {
  correlationId?: string;
  requestId?: string;
  ordemServicoId?: string;
  eventId?: string;
  causationId?: string | null;
  eventType?: string;
  rodada?: number;
}

export const correlationIdStorage =
  new AsyncLocalStorage<ObservabilityContext>();

export function getCorrelationId(): string | undefined {
  return correlationIdStorage.getStore()?.correlationId;
}

export function requireCorrelationId(): string {
  const correlationId = getCorrelationId();
  if (!correlationId) {
    throw new Error('correlationId ausente no contexto de observabilidade');
  }
  return correlationId;
}

export function getRequestId(): string | undefined {
  return correlationIdStorage.getStore()?.requestId;
}

export function getObservabilityLogFields(): Record<string, unknown> {
  const store = correlationIdStorage.getStore();
  if (!store) {
    return {};
  }

  const campos: Record<string, unknown> = {};
  if (store.correlationId) campos.correlationId = store.correlationId;
  if (store.requestId) campos.requestId = store.requestId;
  if (store.ordemServicoId) campos.ordemServicoId = store.ordemServicoId;
  if (store.eventId) campos.eventId = store.eventId;
  if (store.causationId !== undefined) campos.causationId = store.causationId;
  if (store.eventType) campos.eventType = store.eventType;
  if (store.rodada !== undefined) campos.rodada = store.rodada;
  return campos;
}

export function enrichObservabilityContext(
  patch: Partial<ObservabilityContext>,
): void {
  const store = correlationIdStorage.getStore();
  if (!store) {
    return;
  }
  Object.assign(store, patch);
}

export function runWithObservabilityContext<T>(
  context: ObservabilityContext,
  fn: () => T,
): T {
  return correlationIdStorage.run(context, fn);
}

export function extractCorrelationId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const incoming = headers[CORRELATION_HEADER] ?? headers['X-Correlation-Id'];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  const trimmed = value?.trim();
  if (trimmed && UUID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}

export function extractRequestId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const incoming = headers[REQUEST_HEADER] ?? headers['X-Request-Id'];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  const trimmed = value?.trim();
  if (trimmed && UUID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}
