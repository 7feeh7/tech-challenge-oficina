import type { StatusOS } from '@/modules/ordens-servico/domain/status-os';

export interface OrdemParaDecisao {
  status: StatusOS;
  rodadaVigente: number;
  rodadaFato: number;
  orderIdFato: string | null;
  /** Orders da rodada com pagamento confirmado (order só criada não entra). */
  ordersPagas: string[];
  consultaIdVigente: string | null;
  consultaIdFato: string | null;
  emCompensacaoConsultaE10: boolean;
  /** `EstornoConcluido` com `origemEstorno = SEGUNDO_PAGAMENTO`. */
  estornoDeSegundoPagamento: boolean;
  /** A order do `PagamentoConfirmado` já tem a evidência do estorno do segundo pagamento. */
  estornoSegundoPagamentoRegistrado: boolean;
}
