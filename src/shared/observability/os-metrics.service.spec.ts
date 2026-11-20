const mockIncrement = jest.fn();
const mockDistribution = jest.fn();
const mockGauge = jest.fn();

jest.mock('@/tracer', () => ({
  __esModule: true,
  default: {
    dogstatsd: {
      increment: mockIncrement,
      distribution: mockDistribution,
      gauge: mockGauge,
    },
  },
}));

import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { MetricsService } from './metrics.service';
import { OsMetricsService, STATUS_COM_DURACAO } from './os-metrics.service';
import { METRIC_NAMES } from './observability.config';

describe('OsMetricsService', () => {
  const prisma = {
    historicoStatusOS: {
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  let service: OsMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    const metrics = new MetricsService();
    metrics.onModuleInit();
    service = new OsMetricsService(metrics, prisma as never);
  });

  it('emite contador de OS criada sem tag de id', () => {
    service.recordOsCriada();

    expect(mockIncrement).toHaveBeenCalledWith(
      METRIC_NAMES.osCriada,
      1,
      expect.arrayContaining(['status:RECEBIDA']),
    );
  });

  it('calcula duracao ao sair de EM_DIAGNOSTICO', async () => {
    prisma.historicoStatusOS.findFirst.mockResolvedValue({
      ocorridoEm: new Date('2026-09-13T10:00:00.000Z'),
    });

    await service.recordTransicao(
      'os-id-interno',
      StatusOS.EM_DIAGNOSTICO,
      new Date('2026-09-13T10:30:00.000Z'),
    );

    expect(mockDistribution).toHaveBeenCalledWith(
      METRIC_NAMES.osTempoPorStatus,
      1800,
      expect.arrayContaining(['status:EM_DIAGNOSTICO']),
    );
  });

  it('emite contador de situação financeira indeterminada', () => {
    service.recordSituacaoFinanceiraIndeterminada();
    expect(mockIncrement).toHaveBeenCalled();
    expect(mockIncrement.mock.calls[0][0]).toBe(
      METRIC_NAMES.situacaoFinanceiraIndeterminada,
    );
  });

  it('calcula duracao ao sair de AGUARDANDO_PAGAMENTO', async () => {
    prisma.historicoStatusOS.findFirst.mockResolvedValue({
      ocorridoEm: new Date('2026-09-13T12:00:00.000Z'),
    });

    await service.recordTransicao(
      'os-id-interno',
      StatusOS.AGUARDANDO_PAGAMENTO,
      new Date('2026-09-13T13:00:00.000Z'),
    );

    expect(mockDistribution).toHaveBeenCalledWith(
      METRIC_NAMES.osTempoPorStatus,
      3600,
      expect.arrayContaining(['status:AGUARDANDO_PAGAMENTO']),
    );
  });

  it('ignora status fora do catalogo de duracao', async () => {
    await service.recordTransicao(
      'os-id-interno',
      StatusOS.RECEBIDA,
      new Date(),
    );

    expect(prisma.historicoStatusOS.findFirst).not.toHaveBeenCalled();
    expect(mockDistribution).not.toHaveBeenCalled();
  });

  describe('recordIdadeMaisAntigaPorStatus', () => {
    const agora = new Date('2026-11-18T12:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(agora);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function gaugePorStatus(): Record<string, number> {
      return Object.fromEntries(
        mockGauge.mock.calls.map((chamada) => [
          (chamada[2] as string[]).find((tag) => tag.startsWith('status:')),
          chamada[1] as number,
        ]),
      );
    }

    it('emite a idade em segundos da OS mais antiga de cada status', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          status: StatusOS.EM_CANCELAMENTO,
          entrou_em: new Date('2026-11-18T11:00:00.000Z'),
        },
        {
          status: StatusOS.EM_EXECUCAO,
          entrou_em: new Date('2026-11-18T11:59:30.000Z'),
        },
      ]);

      await service.recordIdadeMaisAntigaPorStatus();

      const gauges = gaugePorStatus();
      expect(gauges['status:EM_CANCELAMENTO']).toBe(3600);
      expect(gauges['status:EM_EXECUCAO']).toBe(30);
    });

    it('emite um gauge por status de duração, só com as tags status, environment e service', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.recordIdadeMaisAntigaPorStatus();

      expect(mockGauge).toHaveBeenCalledTimes(STATUS_COM_DURACAO.length);
      for (const status of STATUS_COM_DURACAO) {
        expect(mockGauge).toHaveBeenCalledWith(
          METRIC_NAMES.osIdadeMaisAntigaSegundos,
          expect.any(Number),
          [
            `status:${status}`,
            expect.stringMatching(/^environment:/),
            expect.stringMatching(/^service:/),
          ],
        );
      }
    });

    it('emite zero nos status sem OS para o monitor não ficar sem dado', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          status: StatusOS.EM_DIAGNOSTICO,
          entrou_em: new Date('2026-11-18T11:00:00.000Z'),
        },
      ]);

      await service.recordIdadeMaisAntigaPorStatus();

      const gauges = gaugePorStatus();
      expect(gauges['status:EM_DIAGNOSTICO']).toBe(3600);
      expect(gauges['status:AGUARDANDO_PAGAMENTO']).toBe(0);
      expect(gauges['status:EM_CANCELAMENTO']).toBe(0);
    });

    it('não emite idade negativa quando a entrada é posterior ao relógio local', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          status: StatusOS.FINALIZADA,
          entrou_em: new Date('2026-11-18T12:00:05.000Z'),
        },
      ]);

      await service.recordIdadeMaisAntigaPorStatus();

      expect(gaugePorStatus()['status:FINALIZADA']).toBe(0);
    });

    it('isola a falha da consulta sem emitir métrica nem lançar erro', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('banco indisponível'));

      await expect(
        service.recordIdadeMaisAntigaPorStatus(),
      ).resolves.toBeUndefined();

      expect(mockGauge).not.toHaveBeenCalled();
    });
  });
});
