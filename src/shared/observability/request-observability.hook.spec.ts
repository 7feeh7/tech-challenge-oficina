import Fastify from 'fastify';
import { registerRequestObservabilityHook } from './request-observability.hook';
import { JsonLoggerService } from './json-logger.service';

describe('registerRequestObservabilityHook', () => {
  it('propaga correlation id e registra ciclo da requisição', async () => {
    const logger = {
      logWithMeta: jest.fn(),
    } as unknown as JsonLoggerService;

    const app = Fastify();
    registerRequestObservabilityHook(app, logger);

    app.get('/v1/recursos/10', async (_req, reply) => {
      return reply.status(404).send({ message: 'nao encontrado' });
    });

    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/recursos/10',
      headers: { 'x-correlation-id': 'corr-hook' },
    });

    expect(res.headers['x-correlation-id']).toBe('corr-hook');
    expect(logger.logWithMeta).toHaveBeenCalledWith(
      'info',
      'request.started',
      expect.objectContaining({ route: '/v1/recursos/:id' }),
      'HttpRequest',
    );
    expect(logger.logWithMeta).toHaveBeenCalledWith(
      'info',
      'request.failed',
      expect.objectContaining({ statusCode: 404 }),
      'HttpRequest',
    );

    await app.close();
  });

  it('usa nível error em resposta 5xx', async () => {
    const logger = {
      logWithMeta: jest.fn(),
    } as unknown as JsonLoggerService;

    const app = Fastify();
    registerRequestObservabilityHook(app, logger);

    app.get('/falha-servidor', async (_req, reply) => {
      return reply.status(503).send({ message: 'indisponível' });
    });

    await app.ready();
    await app.inject({ method: 'GET', url: '/falha-servidor' });

    expect(logger.logWithMeta).toHaveBeenCalledWith(
      'error',
      'request.failed',
      expect.objectContaining({ statusCode: 503 }),
      'HttpRequest',
    );

    await app.close();
  });

  it('registra onError com nível error', async () => {
    const logger = {
      logWithMeta: jest.fn(),
    } as unknown as JsonLoggerService;

    const app = Fastify();
    registerRequestObservabilityHook(app, logger);

    app.get('/erro', () => {
      throw new Error('falha simulada');
    });

    await app.ready();
    await app.inject({ method: 'GET', url: '/erro' });

    expect(logger.logWithMeta).toHaveBeenCalledWith(
      'error',
      'request.error',
      expect.objectContaining({ error: 'falha simulada' }),
      'HttpRequest',
    );

    await app.close();
  });
});
