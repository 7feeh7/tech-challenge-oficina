import { Injectable } from '@nestjs/common';
import { executarTransacaoComLimite } from '@/shared/database/executar-transacao-com-limite';
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

  // As duas consultas dividem uma transação para que `limiteMs` valha para o conjunto.
  async recordOutboxBacklog(limiteMs: number): Promise<void> {
    await safeTelemetryAsync(async () => {
      const agora = new Date();
      const { pendentes, maisAntiga } = await executarTransacaoComLimite(
        this.prisma,
        limiteMs,
        async (tx) => ({
          pendentes: await tx.outboxMensagem.count({
            where: { enviadoEm: null },
          }),
          maisAntiga: await tx.outboxMensagem.findFirst({
            where: { enviadoEm: null },
            orderBy: { criadoEm: 'asc' },
            select: { criadoEm: true },
          }),
        }),
      );
      this.metrics.gauge(METRIC_NAMES.outboxPendentes, pendentes);

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
