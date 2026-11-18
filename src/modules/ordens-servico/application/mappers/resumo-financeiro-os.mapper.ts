import {
  NATUREZA_CONFIRMACAO_PAGAMENTO,
  PREFIXO_ORDER_CONFIRMADA,
} from '../../domain/confirmacao-pagamento-projecao';

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

// Com order paga, o resumo mostra a primeira order paga da rodada; sem pagamento,
// a order mais recente (a que o cliente deve pagar após uma reemissão, D1.15).
function ordemDoResumo(
  daRodada: LinhaProjecaoFinanceira[],
): LinhaProjecaoFinanceira | undefined {
  const ordens = daRodada.filter((p) => p.natureza === NATUREZA_PAGAMENTO);
  const primeiraPaga = daRodada
    .filter((p) => p.natureza === NATUREZA_CONFIRMACAO_PAGAMENTO)
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())[0];
  if (!primeiraPaga) {
    return maisRecente(ordens);
  }
  const orderIdPaga = primeiraPaga.orderId.slice(
    PREFIXO_ORDER_CONFIRMADA.length,
  );
  return ordens.find((p) => p.orderId === orderIdPaga) ?? maisRecente(ordens);
}

export function montarResumoFinanceiro(
  rodadaVigente: number,
  projecoes: LinhaProjecaoFinanceira[],
): ResumoFinanceiroOs {
  const daRodada = projecoes.filter((p) => p.rodada === rodadaVigente);
  const orcamentoLinha = maisRecente(
    daRodada.filter((p) => p.natureza === NATUREZA_ORCAMENTO),
  );
  const pagamentoLinha = ordemDoResumo(daRodada);

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
