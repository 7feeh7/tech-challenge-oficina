import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import { METRIC_NAMES } from './observability.config';
import { MetricsService } from './metrics.service';
import { safeTelemetryAsync } from './safe-telemetry';

export type ResultadoProcessamentoMensagem = 'processada' | 'duplicada';
export type TipoErroConsumoMensagem = 'transitorio' | 'permanente';

@Injectable()
export class MessagingMetricsService {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  recordPublicacaoFalha(): void {
    this.metrics.increment(METRIC_NAMES.outboxPublicacaoFalha, 1);
  }

  recordMensagemProcessada(resultado: ResultadoProcessamentoMensagem): void {
    this.metrics.increment(METRIC_NAMES.mensagemProcessada, 1, [
      `resultado:${resultado}`,
    ]);
  }

  recordErroConsumo(tipo: TipoErroConsumoMensagem): void {
    this.metrics.increment(METRIC_NAMES.mensagemErroConsumo, 1, [
      `tipo:${tipo}`,
    ]);
  }

  async recordOutboxBacklog(): Promise<void> {
    await safeTelemetryAsync(async () => {
      const agora = new Date();
      const pendentes = await this.prisma.outboxMensagem.count({
        where: { enviadoEm: null },
      });
      this.metrics.gauge(METRIC_NAMES.outboxPendentes, pendentes);

      const maisAntiga = await this.prisma.outboxMensagem.findFirst({
        where: { enviadoEm: null },
        orderBy: { criadoEm: 'asc' },
        select: { criadoEm: true },
      });
      const idadeSegundos = maisAntiga
        ? (agora.getTime() - maisAntiga.criadoEm.getTime()) / 1000
        : 0;
      this.metrics.gauge(
        METRIC_NAMES.outboxIdadeMaisAntigaSegundos,
        idadeSegundos,
      );
    });
  }
}
