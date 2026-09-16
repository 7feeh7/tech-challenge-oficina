import { FastifyInstance } from 'fastify';
import { extractCorrelationId } from './correlation-id.context';

const HEADER = 'x-correlation-id';

export function registerCorrelationIdHook(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    const correlationId = extractCorrelationId(request.headers);

    request.headers[HEADER] = correlationId;
    reply.header('X-Correlation-Id', correlationId);
    done();
  });
}
