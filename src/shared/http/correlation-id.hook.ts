import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';

const HEADER = 'x-correlation-id';

export function registerCorrelationIdHook(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    const incoming =
      request.headers[HEADER] ?? request.headers['X-Correlation-Id'];
    const correlationId =
      (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() ||
      randomUUID();

    request.headers[HEADER] = correlationId;
    reply.header('X-Correlation-Id', correlationId);
    done();
  });
}
