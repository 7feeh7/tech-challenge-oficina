import type { StatusOS } from '@/modules/ordens-servico/domain/status-os';

export interface OrdemParaDecisao {
  status: StatusOS;
  rodadaVigente: number;
  rodadaFato: number;
  orderIdFato: string | null;
  orderIdJaRegistrado: string | null;
  mesmoOrderId: boolean;
}
