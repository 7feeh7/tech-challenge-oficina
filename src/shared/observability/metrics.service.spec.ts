const mockIncrement = jest.fn();
const mockDistribution = jest.fn();
const mockHistogram = jest.fn();
const mockTiming = jest.fn();

jest.mock('@/tracer', () => ({
  __esModule: true,
  default: {
    dogstatsd: {
      increment: mockIncrement,
      distribution: mockDistribution,
      histogram: mockHistogram,
      timing: mockTiming,
    },
  },
}));

import { MetricsService } from './metrics.service';
import { METRIC_NAMES } from './observability.config';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MetricsService();
    service.onModuleInit();
  });

  it('incrementa contador com tags base', () => {
    service.increment(METRIC_NAMES.osCriada, 1, ['status:RECEBIDA']);

    expect(mockIncrement).toHaveBeenCalledWith(
      METRIC_NAMES.osCriada,
      1,
      expect.arrayContaining([
        'status:RECEBIDA',
        expect.stringMatching(/^environment:/),
        'service:oficina-api',
      ]),
    );
  });

  it('registra distribuicao de tempo por status', () => {
    service.distribution(METRIC_NAMES.osTempoPorStatus, 120, [
      'status:EM_DIAGNOSTICO',
    ]);

    expect(mockDistribution).toHaveBeenCalledWith(
      METRIC_NAMES.osTempoPorStatus,
      120,
      expect.arrayContaining(['status:EM_DIAGNOSTICO']),
    );
  });

  it('nao propaga erro quando dogstatsd falha', () => {
    mockIncrement.mockImplementation(() => {
      throw new Error('datadog indisponivel');
    });

    expect(() =>
      service.increment(METRIC_NAMES.integracaoFalha, 1, ['integration:sns']),
    ).not.toThrow();
  });
});
