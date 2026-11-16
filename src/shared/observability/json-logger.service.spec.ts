jest.mock('./trace-context', () => ({
  getActiveTraceIds: jest.fn().mockReturnValue({
    traceId: 'trace-json',
    spanId: 'span-json',
  }),
}));

jest.mock('@/shared/http/correlation-id.context', () => ({
  getCorrelationId: jest.fn().mockReturnValue('corr-json'),
}));

import { JsonLoggerService } from './json-logger.service';

describe('JsonLoggerService', () => {
  let logger: JsonLoggerService;
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    logger = new JsonLoggerService();
    stdout = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    stderr = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emite log estruturado com correlation e trace', () => {
    logger.log('mensagem', 'Teste');

    const payload = JSON.parse(String(stdout.mock.calls[0][0]));
    expect(payload.message).toBe('mensagem');
    expect(payload.context).toBe('Teste');
    expect(payload.correlationId).toBe('corr-json');
    expect(payload.traceId).toBe('trace-json');
  });

  it('registra erro com stack nos metadados', () => {
    logger.error('falhou', 'stack-trace', 'Erro');

    const payload = JSON.parse(String(stderr.mock.calls[0][0]));
    expect(payload.level).toBe('error');
    expect(payload.stack).toBe('stack-trace');
  });

  it('roteia níveis em logWithMeta', () => {
    logger.logWithMeta('warn', 'aviso', { code: 1 }, 'Ctx');
    expect(console.warn).toHaveBeenCalled();

    logger.logWithMeta('error', 'erro', { code: 2 });
    expect(stderr).toHaveBeenCalled();

    logger.logWithMeta('debug', 'dbg', { code: 3 });
    expect(console.debug).toHaveBeenCalled();
  });

  it('expõe demais níveis do LoggerService', () => {
    logger.debug('debug', 'Ctx');
    logger.verbose('verbose', 'Ctx');
    logger.warn('warn', 'Ctx');

    expect(console.debug).toHaveBeenCalled();
    expect(stdout).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });
});
