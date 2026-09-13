import { Global, Module } from '@nestjs/common';
import { JsonLoggerService } from './json-logger.service';
import { MetricsService } from './metrics.service';
import { OsMetricsService } from './os-metrics.service';
import { IntegrationMetricsService } from './integration-metrics.service';

@Global()
@Module({
  providers: [
    JsonLoggerService,
    MetricsService,
    OsMetricsService,
    IntegrationMetricsService,
  ],
  exports: [
    JsonLoggerService,
    MetricsService,
    OsMetricsService,
    IntegrationMetricsService,
  ],
})
export class ObservabilityModule {}
