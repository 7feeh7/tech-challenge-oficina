import { Injectable, OnModuleInit } from '@nestjs/common';
import tracer from '@/tracer';
import { OBSERVABILITY } from './observability.config';
import { safeTelemetry } from './safe-telemetry';

type DogStatsD = typeof tracer.dogstatsd;

@Injectable()
export class MetricsService implements OnModuleInit {
  private dogstatsd?: DogStatsD;

  onModuleInit(): void {
    this.dogstatsd = tracer.dogstatsd;
  }

  increment(metric: string, value = 1, tags: string[] = []): void {
    safeTelemetry(() => {
      this.dogstatsd?.increment(metric, value, this.withBaseTags(tags));
    });
  }

  distribution(metric: string, value: number, tags: string[] = []): void {
    safeTelemetry(() => {
      this.dogstatsd?.distribution(metric, value, this.withBaseTags(tags));
    });
  }

  histogram(metric: string, value: number, tags: string[] = []): void {
    safeTelemetry(() => {
      this.dogstatsd?.histogram(metric, value, this.withBaseTags(tags));
    });
  }

  timing(metric: string, valueMs: number, tags: string[] = []): void {
    this.histogram(metric, valueMs, tags);
  }

  private withBaseTags(tags: string[]): string[] {
    return [
      ...tags,
      `environment:${OBSERVABILITY.env}`,
      `service:${OBSERVABILITY.service}`,
    ];
  }
}
