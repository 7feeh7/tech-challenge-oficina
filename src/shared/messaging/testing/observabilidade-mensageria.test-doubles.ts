import type { JsonLoggerService } from '@/shared/observability/json-logger.service';
import type { MessagingMetricsService } from '@/shared/observability/messaging-metrics.service';
import type { OsMetricsService } from '@/shared/observability/os-metrics.service';

export function criarJsonLoggerMensageriaFake(): Pick<
  JsonLoggerService,
  'logWithMeta'
> {
  return { logWithMeta: jest.fn() };
}

export function criarMessagingMetricsFake(): Pick<
  MessagingMetricsService,
  | 'recordPublicacaoFalha'
  | 'recordOutboxBacklog'
  | 'recordMensagemProcessada'
  | 'recordErroConsumo'
> {
  return {
    recordPublicacaoFalha: jest.fn(),
    recordOutboxBacklog: jest.fn().mockResolvedValue(undefined),
    recordMensagemProcessada: jest.fn(),
    recordErroConsumo: jest.fn(),
  };
}

export function criarOsMetricsMensageriaFake(): Pick<
  OsMetricsService,
  'recordTransicaoFalha'
> {
  return { recordTransicaoFalha: jest.fn() };
}
