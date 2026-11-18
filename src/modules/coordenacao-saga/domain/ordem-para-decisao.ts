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
}
