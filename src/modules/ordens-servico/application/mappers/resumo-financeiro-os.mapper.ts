export interface ResumoFinanceiroOrcamento {
  orcamentoId: string;
  valorCentavos: number | null;
}

export interface ResumoFinanceiroPagamento {
  orcamentoId: string | null;
  cobrancaId: string | null;
  orderId: string;
  valorCentavos: number | null;
  linkPagamento: string | null;
}

export interface ResumoFinanceiroOs {
  orcamento: ResumoFinanceiroOrcamento | null;
  pagamento: ResumoFinanceiroPagamento | null;
}

export interface LinhaProjecaoFinanceira {
  rodada: number;
  natureza: string;
  orcamentoId: string | null;
  cobrancaId: string | null;
  orderId: string;
  valorCentavos: number | null;
  linkPagamento: string | null;
  criadoEm: Date;
}

const NATUREZA_ORCAMENTO = 'ORCAMENTO';
const NATUREZA_PAGAMENTO = 'PAGAMENTO';

function maisRecente(
  linhas: LinhaProjecaoFinanceira[],
): LinhaProjecaoFinanceira | undefined {
  return [...linhas].sort(
    (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
  )[0];
}

export function montarResumoFinanceiro(
  rodadaVigente: number,
  projecoes: LinhaProjecaoFinanceira[],
): ResumoFinanceiroOs {
  const daRodada = projecoes.filter((p) => p.rodada === rodadaVigente);
  const orcamentoLinha = maisRecente(
    daRodada.filter((p) => p.natureza === NATUREZA_ORCAMENTO),
  );
  const pagamentoLinha = maisRecente(
    daRodada.filter((p) => p.natureza === NATUREZA_PAGAMENTO),
  );

  return {
    orcamento: orcamentoLinha?.orcamentoId
      ? {
          orcamentoId: orcamentoLinha.orcamentoId,
          valorCentavos: orcamentoLinha.valorCentavos,
        }
      : null,
    pagamento: pagamentoLinha
      ? {
          orcamentoId: pagamentoLinha.orcamentoId,
          cobrancaId: pagamentoLinha.cobrancaId,
          orderId: pagamentoLinha.orderId,
          valorCentavos: pagamentoLinha.valorCentavos,
          linkPagamento: pagamentoLinha.linkPagamento,
        }
      : null,
  };
}
