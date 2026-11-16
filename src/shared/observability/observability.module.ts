import { Global, Module } from '@nestjs/common';
import { JsonLoggerService } from './json-logger.service';
import { MetricsService } from './metrics.service';
import { OsMetricsService } from './os-metrics.service';
import { IntegrationMetricsService } from './integration-metrics.service';
import { MessagingMetricsService } from './messaging-metrics.service';

@Global()
@Module({
  providers: [
    JsonLoggerService,
    MetricsService,
    OsMetricsService,
    IntegrationMetricsService,
    MessagingMetricsService,
  ],
  exports: [
    JsonLoggerService,
    MetricsService,
    OsMetricsService,
    IntegrationMetricsService,
    MessagingMetricsService,
  ],
})
export class ObservabilityModule {}
