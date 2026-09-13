const mockIncrement = jest.fn();
const mockDistribution = jest.fn();

jest.mock('@/tracer', () => ({
  __esModule: true,
  default: {
    dogstatsd: {
      increment: mockIncrement,
      distribution: mockDistribution,
    },
  },
}));

import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { MetricsService } from './metrics.service';
import { OsMetricsService } from './os-metrics.service';
import { METRIC_NAMES } from './observability.config';

describe('OsMetricsService', () => {
  const prisma = {
    historicoStatusOS: {
      findFirst: jest.fn(),
    },
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
      criadoEm: new Date('2026-09-13T10:00:00.000Z'),
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

  it('ignora status fora do catalogo de duracao', async () => {
    await service.recordTransicao(
      'os-id-interno',
      StatusOS.RECEBIDA,
      new Date(),
    );

    expect(prisma.historicoStatusOS.findFirst).not.toHaveBeenCalled();
    expect(mockDistribution).not.toHaveBeenCalled();
  });
});
