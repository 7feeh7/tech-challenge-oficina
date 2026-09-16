import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { METRIC_NAMES } from './observability.config';
import { MetricsService } from './metrics.service';
import { safeTelemetryAsync } from './safe-telemetry';

const STATUS_COM_DURACAO: StatusOS[] = [
  StatusOS.EM_DIAGNOSTICO,
  StatusOS.EM_EXECUCAO,
  StatusOS.FINALIZADA,
];

@Injectable()
export class OsMetricsService {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  recordOsCriada(): void {
    this.metrics.increment(METRIC_NAMES.osCriada, 1, [
      `status:${StatusOS.RECEBIDA}`,
    ]);
  }

  recordTransicaoFalha(): void {
    this.metrics.increment(METRIC_NAMES.osTransicaoFalha, 1);
  }

  async recordTransicao(
    ordemServicoId: string,
    statusAnterior: StatusOS,
    transicaoEm: Date = new Date(),
  ): Promise<void> {
    await safeTelemetryAsync(async () => {
      if (!STATUS_COM_DURACAO.includes(statusAnterior)) {
        return;
      }

      const entrada = await this.prisma.historicoStatusOS.findFirst({
        where: {
          ordemServicoId,
          statusNovo: statusAnterior,
          criadoEm: { lt: transicaoEm },
        },
        orderBy: { criadoEm: 'desc' },
        select: { criadoEm: true },
      });

      if (!entrada) {
        return;
      }

      const duracaoSegundos =
        (transicaoEm.getTime() - entrada.criadoEm.getTime()) / 1000;

      if (duracaoSegundos < 0) {
        return;
      }

      this.metrics.distribution(
        METRIC_NAMES.osTempoPorStatus,
        duracaoSegundos,
        [`status:${statusAnterior}`],
      );
    });
  }
}
