import { TransicaoStatusInvalidaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import type { OsMetricsService } from './os-metrics.service';

export function registrarFalhaTransicaoSeAplicavel(
  erro: unknown,
  osMetrics: OsMetricsService,
): void {
  if (erro instanceof TransicaoStatusInvalidaError) {
    osMetrics.recordTransicaoFalha();
  }
}
