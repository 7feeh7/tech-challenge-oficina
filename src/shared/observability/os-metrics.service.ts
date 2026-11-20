import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { METRIC_NAMES } from './observability.config';
import { MetricsService } from './metrics.service';
import { safeTelemetryAsync } from './safe-telemetry';

export const STATUS_COM_DURACAO: StatusOS[] = [
  StatusOS.EM_DIAGNOSTICO,
  StatusOS.AGUARDANDO_APROVACAO,
  StatusOS.AGUARDANDO_PAGAMENTO,
  StatusOS.AGUARDANDO_EXECUCAO,
  StatusOS.EM_EXECUCAO,
  StatusOS.EM_CANCELAMENTO,
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

  recordSituacaoFinanceiraIndeterminada(): void {
    this.metrics.increment(METRIC_NAMES.situacaoFinanceiraIndeterminada, 1);
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
          ocorridoEm: { lt: transicaoEm },
        },
        orderBy: { ocorridoEm: 'desc' },
        select: { ocorridoEm: true },
      });

      if (!entrada) {
        return;
      }

      const duracaoSegundos =
        (transicaoEm.getTime() - entrada.ocorridoEm.getTime()) / 1000;

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

  async recordIdadeMaisAntigaPorStatus(): Promise<void> {
    await safeTelemetryAsync(async () => {
      const agora = new Date();
      const entradas = await this.buscarEntradaMaisAntigaPorStatus();

      for (const status of STATUS_COM_DURACAO) {
        const entradaMaisAntiga = entradas.get(status);
        // Sem OS no status o gauge vai a 0, para o monitor não ficar sem dado.
        const idadeSegundos = entradaMaisAntiga
          ? Math.max(0, (agora.getTime() - entradaMaisAntiga.getTime()) / 1000)
          : 0;

        this.metrics.gauge(
          METRIC_NAMES.osIdadeMaisAntigaSegundos,
          idadeSegundos,
          [`status:${status}`],
        );
      }
    });
  }

  // Entrada no status atual = último histórico com statusNovo igual ao status da
  // OS (uma OS pode reentrar no mesmo status em outra rodada). Se faltar
  // histórico, usa a criação da OS: superestima a idade em vez de esconder a OS.
  private async buscarEntradaMaisAntigaPorStatus(): Promise<
    Map<StatusOS, Date>
  > {
    const linhas = await this.prisma.$queryRaw<
      { status: StatusOS; entrou_em: Date }[]
    >`
      SELECT os.status::text AS status,
             MIN(COALESCE(entrada.ocorrido_em, os.criado_em)) AS entrou_em
      FROM ordens_servico os
      LEFT JOIN LATERAL (
        SELECT MAX(historico.ocorrido_em) AS ocorrido_em
        FROM historico_status_os historico
        WHERE historico.ordem_servico_id = os.id
          AND historico.status_novo = os.status
      ) entrada ON TRUE
      WHERE os.status = ANY(${STATUS_COM_DURACAO}::"StatusOS"[])
      GROUP BY os.status`;

    return new Map(linhas.map((linha) => [linha.status, linha.entrou_em]));
  }
}
