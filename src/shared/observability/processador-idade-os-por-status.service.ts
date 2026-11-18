import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgendadorCicloProcessador } from '@/shared/messaging/infra/agendador-ciclo-processador';
import { OsMetricsService } from './os-metrics.service';

const INTERVALO_PADRAO_MS = 60_000;

@Injectable()
export class ProcessadorIdadeOsPorStatusService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProcessadorIdadeOsPorStatusService.name);
  private agendador?: AgendadorCicloProcessador;
  private readonly habilitado: boolean;
  private readonly intervaloMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly osMetrics: OsMetricsService,
  ) {
    this.habilitado =
      this.config.get<string>('OS_IDADE_POR_STATUS_HABILITADO') === 'true';
    this.intervaloMs = this.lerIntervaloMs();
  }

  onModuleInit(): void {
    if (!this.habilitado) return;

    this.agendador = new AgendadorCicloProcessador(
      this.intervaloMs,
      () => this.osMetrics.recordIdadeMaisAntigaPorStatus(),
      this.logger,
      'Falha ao emitir a idade das OS por status',
    );
    this.agendador.iniciar();
  }

  async onModuleDestroy(): Promise<void> {
    await this.agendador?.parar();
  }

  // Intervalo inválido (NaN ou <= 0) viraria um laço sem pausa no setTimeout.
  private lerIntervaloMs(): number {
    const intervaloMs = Number(
      this.config.get<string>('OS_IDADE_POR_STATUS_INTERVAL_MS') ??
        INTERVALO_PADRAO_MS,
    );
    return Number.isFinite(intervaloMs) && intervaloMs > 0
      ? intervaloMs
      : INTERVALO_PADRAO_MS;
  }
}
