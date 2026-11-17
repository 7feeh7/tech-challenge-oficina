import {
  conteudosConsumoSemanticamenteEquivalentes,
  deContextoConsumo,
} from './comparar-consumo-semantico';

describe('comparar consumo semântico', () => {
  const horario = new Date('2026-01-01T12:00:00.000Z');
  const ctx = {
    eventId: 'evt-1',
    fatoOcorridoEm: horario,
    tipoFato: 'REPARO_FALHOU' as const,
    consumoEfetivo: [{ itemId: 'p1', quantidade: 2 }],
  };

  it('considera equivalente com mesmos campos', () => {
    const a = deContextoConsumo(
      ctx,
      [{ itemId: 'p1', quantidade: 2 }],
      [],
      'falha',
    );
    const b = deContextoConsumo(
      ctx,
      [{ itemId: 'p1', quantidade: 2 }],
      [],
      'falha',
    );
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(true);
  });

  it('detecta consumo divergente', () => {
    const a = deContextoConsumo(
      ctx,
      [{ itemId: 'p1', quantidade: 2 }],
      [],
      null,
    );
    const b = deContextoConsumo(
      ctx,
      [{ itemId: 'p1', quantidade: 1 }],
      [],
      null,
    );
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(false);
  });

  it('ignora motivo quando só um lado informa', () => {
    const a = deContextoConsumo(ctx, [], [], 'falha');
    const b = deContextoConsumo(ctx, [], [], null);
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(true);
  });

  it('rejeita eventId divergente', () => {
    const a = deContextoConsumo(ctx, [], [], null);
    const b = deContextoConsumo({ ...ctx, eventId: 'evt-2' }, [], [], null);
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(false);
  });

  it('rejeita tipoFato divergente', () => {
    const a = deContextoConsumo(ctx, [], [], null);
    const b = deContextoConsumo(
      { ...ctx, tipoFato: 'REPARO_CONCLUIDO' },
      [],
      [],
      null,
    );
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(false);
  });

  it('rejeita responsavelId divergente', () => {
    const a = deContextoConsumo({ ...ctx, responsavelId: 'r1' }, [], [], null);
    const b = deContextoConsumo({ ...ctx, responsavelId: 'r2' }, [], [], null);
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(false);
  });

  it('rejeita fatoOcorridoEm fora da tolerância', () => {
    const a = deContextoConsumo(ctx, [], [], null);
    const b = deContextoConsumo(
      {
        ...ctx,
        fatoOcorridoEm: new Date('2026-01-01T12:00:05.000Z'),
      },
      [],
      [],
      null,
    );
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(false);
  });

  it('rejeita concluidoEm divergente', () => {
    const quando = new Date('2026-01-02T12:00:00.000Z');
    const a = deContextoConsumo({ ...ctx, concluidoEm: horario }, [], [], null);
    const b = deContextoConsumo({ ...ctx, concluidoEm: quando }, [], [], null);
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(false);
  });

  it('rejeita quando ambos informam motivo distinto', () => {
    const a = deContextoConsumo(ctx, [], [], 'a');
    const b = deContextoConsumo(ctx, [], [], 'b');
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(false);
  });

  it('consolida itens repetidos na comparação', () => {
    const a = deContextoConsumo(
      ctx,
      [
        { itemId: 'p1', quantidade: 1 },
        { itemId: 'p1', quantidade: 1 },
      ],
      [],
      null,
    );
    const b = deContextoConsumo(
      ctx,
      [{ itemId: 'p1', quantidade: 2 }],
      [],
      null,
    );
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(true);
  });

  it('compara divergências por conteúdo', () => {
    const divergencias = [
      {
        itemId: 'p1',
        tipo: 'FALTA',
        quantidadePrevista: 2,
        quantidadeUtilizada: 1,
        justificativa: 'x',
      },
    ];
    const a = deContextoConsumo(ctx, [], divergencias, null);
    const b = deContextoConsumo(ctx, [], divergencias, null);
    expect(conteudosConsumoSemanticamenteEquivalentes(a, b)).toBe(true);
    const c = deContextoConsumo(
      ctx,
      [],
      [{ ...divergencias[0], quantidadeUtilizada: 2 }],
      null,
    );
    expect(conteudosConsumoSemanticamenteEquivalentes(a, c)).toBe(false);
  });
});
