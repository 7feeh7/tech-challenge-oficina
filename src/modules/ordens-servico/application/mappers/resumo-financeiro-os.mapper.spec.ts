import { montarResumoFinanceiro } from './resumo-financeiro-os.mapper';

describe('montarResumoFinanceiro', () => {
  it('agrega orçamento e pagamento da rodada vigente', () => {
    const resumo = montarResumoFinanceiro(1, [
      {
        rodada: 1,
        natureza: 'ORCAMENTO',
        orcamentoId: 'orc-1',
        cobrancaId: null,
        orderId: 'orcamento:orc-1',
        valorCentavos: 15000,
        linkPagamento: null,
        criadoEm: new Date('2026-01-01T10:00:00Z'),
      },
      {
        rodada: 1,
        natureza: 'PAGAMENTO',
        orcamentoId: 'orc-1',
        cobrancaId: 'cob-1',
        orderId: 'ORD-1',
        valorCentavos: 15000,
        linkPagamento: 'https://pay',
        criadoEm: new Date('2026-01-01T11:00:00Z'),
      },
      {
        rodada: 2,
        natureza: 'ORCAMENTO',
        orcamentoId: 'orc-2',
        cobrancaId: null,
        orderId: 'orcamento:orc-2',
        valorCentavos: 20000,
        linkPagamento: null,
        criadoEm: new Date('2026-01-02T10:00:00Z'),
      },
    ]);

    expect(resumo.orcamento).toEqual({
      orcamentoId: 'orc-1',
      valorCentavos: 15000,
    });
    expect(resumo.pagamento).toMatchObject({
      orderId: 'ORD-1',
      linkPagamento: 'https://pay',
    });
  });

  it('retorna nulos sem projeção na rodada', () => {
    expect(montarResumoFinanceiro(1, [])).toEqual({
      orcamento: null,
      pagamento: null,
    });
  });
});
