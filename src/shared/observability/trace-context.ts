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
