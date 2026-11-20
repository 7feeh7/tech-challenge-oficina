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

  describe('orders da mesma rodada', () => {
    const order = (orderId: string, hora: number) => ({
      rodada: 1,
      natureza: 'PAGAMENTO',
      orcamentoId: null,
      cobrancaId: 'cob-1',
      orderId,
      valorCentavos: 15000,
      linkPagamento: `https://pay/${orderId}`,
      criadoEm: new Date(`2026-01-01T${hora}:00:00Z`),
    });
    const confirmacao = (orderId: string, hora: number) => ({
      ...order(`confirmado:${orderId}`, hora),
      natureza: 'CONFIRMACAO',
      linkPagamento: null,
    });

    it('sem order paga mostra a mais recente (reemissão)', () => {
      const resumo = montarResumoFinanceiro(1, [
        order('ORD-1', 10),
        order('ORD-2', 11),
      ]);
      expect(resumo.pagamento?.orderId).toBe('ORD-2');
    });

    it('com order paga mostra a primeira paga, mesmo que haja order mais recente', () => {
      const resumo = montarResumoFinanceiro(1, [
        order('ORD-1', 10),
        order('ORD-2', 11),
        confirmacao('ORD-1', 12),
      ]);
      expect(resumo.pagamento).toMatchObject({
        orderId: 'ORD-1',
        linkPagamento: 'https://pay/ORD-1',
      });
    });

    it('com duas orders pagas mostra a que foi paga primeiro', () => {
      const resumo = montarResumoFinanceiro(1, [
        order('ORD-1', 10),
        order('ORD-2', 11),
        confirmacao('ORD-2', 12),
        confirmacao('ORD-1', 13),
      ]);
      expect(resumo.pagamento?.orderId).toBe('ORD-2');
    });
  });
});
