import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  correlationIdStorage,
  extractCorrelationId,
} from '@/shared/http/correlation-id.context';
import { JsonLoggerService } from './json-logger.service';
import { normalizeRoute } from './normalize-route';

const CORRELATION_HEADER = 'x-correlation-id';
const START_TIME = Symbol('requestStartTime');

type RequestWithTiming = FastifyRequest & {
  [START_TIME]?: bigint;
};

export function registerRequestObservabilityHook(
  app: FastifyInstance,
  logger: JsonLoggerService,
): void {
  app.addHook('onRequest', (request, reply, done) => {
    const correlationId = extractCorrelationId(request.headers);
    request.headers[CORRELATION_HEADER] = correlationId;
    reply.header('X-Correlation-Id', correlationId);

    (request as RequestWithTiming)[START_TIME] = process.hrtime.bigint();

    correlationIdStorage.run({ correlationId }, () => {
      logger.logWithMeta(
        'info',
        'request.started',
        {
          method: request.method,
          route: normalizeRoute(request.url),
        },
        'HttpRequest',
      );
      done();
    });
  });

  app.addHook('onResponse', (request, reply, done) => {
    const startedAt = (request as RequestWithTiming)[START_TIME];
    const durationMs = startedAt
      ? Number(process.hrtime.bigint() - startedAt) / 1_000_000
      : 0;

    const correlationId = extractCorrelationId(request.headers);
    correlationIdStorage.run({ correlationId }, () => {
      const level = reply.statusCode >= 500 ? 'error' : 'info';
      logger.logWithMeta(
        level,
        reply.statusCode >= 400 ? 'request.failed' : 'request.completed',
        {
          method: request.method,
          route: normalizeRoute(request.url),
          statusCode: reply.statusCode,
          durationMs: Math.round(durationMs),
        },
        'HttpRequest',
      );
      done();
    });
  });

  app.addHook('onError', (request, reply, error, done) => {
    const startedAt = (request as RequestWithTiming)[START_TIME];
    const durationMs = startedAt
      ? Number(process.hrtime.bigint() - startedAt) / 1_000_000
      : 0;

    const correlationId = extractCorrelationId(request.headers);
    correlationIdStorage.run({ correlationId }, () => {
      logger.logWithMeta(
        'error',
        'request.error',
        {
          method: request.method,
          route: normalizeRoute(request.url),
          statusCode: reply.statusCode,
          durationMs: Math.round(durationMs),
          error: error.message,
        },
        'HttpRequest',
      );
      done();
    });
  });
}
