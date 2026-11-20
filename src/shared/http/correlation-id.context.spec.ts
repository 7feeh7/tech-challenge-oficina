import {
  correlationIdStorage,
  enrichObservabilityContext,
  extractCorrelationId,
  extractRequestId,
  getCorrelationId,
  getObservabilityLogFields,
  getRequestId,
  requireCorrelationId,
} from './correlation-id.context';

describe('correlation-id.context', () => {
  it('extrai correlation id do header ou gera um novo', () => {
    const fixo = extractCorrelationId({
      'x-correlation-id': '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(fixo).toBe('550e8400-e29b-41d4-a716-446655440000');

    const deArray = extractCorrelationId({
      'x-correlation-id': [
        '  550e8400-e29b-41d4-a716-446655440001  ',
        'ignorado',
      ],
    });
    expect(deArray).toBe('550e8400-e29b-41d4-a716-446655440001');

    const legado = extractCorrelationId({
      'X-Correlation-Id': '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(legado).toBe('550e8400-e29b-41d4-a716-446655440002');
  });

  it('gera novo id quando header vem vazio ou inválido', () => {
    const gerado = extractCorrelationId({ 'x-correlation-id': '   ' });
    expect(gerado).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const invalido = extractCorrelationId({ 'x-correlation-id': 'nao-uuid' });
    expect(invalido).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('não gera correlation id fora de contexto', () => {
    expect(getCorrelationId()).toBeUndefined();
    expect(getCorrelationId()).toBeUndefined();
  });

  it('usa correlation id do AsyncLocalStorage quando definido', () => {
    const id = correlationIdStorage.run({ correlationId: 'ctx-9' }, () =>
      getCorrelationId(),
    );

    expect(id).toBe('ctx-9');
  });

  it('isola contextos concorrentes', async () => {
    const resultados = await Promise.all([
      correlationIdStorage.run({ correlationId: 'corr-a' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getCorrelationId();
      }),
      correlationIdStorage.run({ correlationId: 'corr-b' }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getCorrelationId();
      }),
    ]);

    expect(resultados).toEqual(['corr-a', 'corr-b']);
  });

  it('extrai request id do header ou gera um novo', () => {
    const fixo = extractRequestId({
      'x-request-id': '660e8400-e29b-41d4-a716-446655440000',
    });
    expect(fixo).toBe('660e8400-e29b-41d4-a716-446655440000');

    const gerado = extractRequestId({});
    expect(gerado).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('propaga request id no contexto', () => {
    const id = correlationIdStorage.run(
      { correlationId: 'c', requestId: 'req-1' },
      () => getRequestId(),
    );
    expect(id).toBe('req-1');
  });

  it('expõe campos de log só quando definidos no contexto', () => {
    expect(getObservabilityLogFields()).toEqual({});

    const campos = correlationIdStorage.run(
      {
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        requestId: '660e8400-e29b-41d4-a716-446655440000',
        eventId: '770e8400-e29b-41d4-a716-446655440000',
        ordemServicoId: '880e8400-e29b-41d4-a716-446655440000',
        eventType: 'teste.v1',
        rodada: 2,
        causationId: null,
      },
      () => getObservabilityLogFields(),
    );

    expect(campos).toMatchObject({
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      requestId: '660e8400-e29b-41d4-a716-446655440000',
      eventId: '770e8400-e29b-41d4-a716-446655440000',
      ordemServicoId: '880e8400-e29b-41d4-a716-446655440000',
      eventType: 'teste.v1',
      rodada: 2,
      causationId: null,
    });
  });

  it('enriquece contexto ativo sem afetar fora dele', () => {
    enrichObservabilityContext({ ordemServicoId: 'os-sem-contexto' });
    expect(getObservabilityLogFields()).toEqual({});

    correlationIdStorage.run({ correlationId: 'c' }, () => {
      enrichObservabilityContext({ ordemServicoId: 'os-1' });
      expect(getObservabilityLogFields().ordemServicoId).toBe('os-1');
    });
  });

  it('exige correlation id quando ausente', () => {
    expect(() => requireCorrelationId()).toThrow(
      'correlationId ausente no contexto de observabilidade',
    );
  });
});
