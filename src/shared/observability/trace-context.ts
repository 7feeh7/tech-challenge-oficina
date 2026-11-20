import tracer from '@/tracer';

export function getActiveTraceIds(): { traceId?: string; spanId?: string } {
  const span = tracer.scope().active();
  if (!span) {
    return {};
  }

  const context = span.context();
  return {
    traceId: context.toTraceId(),
    spanId: context.toSpanId(),
  };
}

export function tagActiveSpanWithCorrelation(correlationId?: string): void {
  if (!correlationId) {
    return;
  }
  const span = tracer.scope().active();
  span?.setTag('correlation_id', correlationId);
}
