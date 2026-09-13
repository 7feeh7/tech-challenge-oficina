import { Injectable } from '@nestjs/common';
import { METRIC_NAMES } from './observability.config';
import { MetricsService } from './metrics.service';

export type IntegrationName =
  | 'postgresql'
  | 'sns'
  | 'sqs'
  | 'sendgrid'
  | 'secrets_manager'
  | 'lambda';

@Injectable()
export class IntegrationMetricsService {
  constructor(private readonly metrics: MetricsService) {}

  recordSuccess(integration: IntegrationName, durationMs: number): void {
    this.metrics.timing(METRIC_NAMES.integracaoLatencia, durationMs, [
      `integration:${integration}`,
      'result:success',
    ]);
  }

  recordFailure(integration: IntegrationName, durationMs?: number): void {
    this.metrics.increment(METRIC_NAMES.integracaoFalha, 1, [
      `integration:${integration}`,
    ]);

    if (durationMs !== undefined) {
      this.metrics.timing(METRIC_NAMES.integracaoLatencia, durationMs, [
        `integration:${integration}`,
        'result:failure',
      ]);
    }
  }
}
