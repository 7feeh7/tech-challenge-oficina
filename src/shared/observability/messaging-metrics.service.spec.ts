const mockGauge = jest.fn();
const mockIncrement = jest.fn();

jest.mock('@/tracer', () => ({
  __esModule: true,
  default: {
    dogstatsd: {
      gauge: mockGauge,
      increment: mockIncrement,
    },
  },
}));

import { MessagingMetricsService } from './messaging-metrics.service';
import { MetricsService } from './metrics.service';
import { METRIC_NAMES } from './observability.config';

describe('MessagingMetricsService', () => {
  let service: MessagingMetricsService;
  const outboxMensagem = {
    count: jest.fn().mockResolvedValue(3),
    findFirst: jest.fn().mockResolvedValue({
      criadoEm: new Date(Date.now() - 60_000),
    }),
  };
  const prisma = {
    $transaction: jest.fn((trabalho: (tx: unknown) => Promise<unknown>) =>
      trabalho({ outboxMensagem, $queryRaw: jest.fn() }),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const metrics = new MetricsService();
    metrics.onModuleInit();
    service = new MessagingMetricsService(metrics, prisma as never);
  });

  it('registra falha de publicação da outbox', () => {
    service.recordPublicacaoFalha();
    expect(mockIncrement).toHaveBeenCalledWith(
      METRIC_NAMES.outboxPublicacaoFalha,
      1,
      expect.any(Array),
    );
  });

  it('emite métricas de consumo sem tags de alta cardinalidade', () => {
    service.recordMensagemProcessada('processada');
    service.recordErroConsumo('transitorio');

    expect(mockIncrement).toHaveBeenCalledWith(
      METRIC_NAMES.mensagemProcessada,
      1,
      expect.arrayContaining(['resultado:processada']),
    );
    expect(mockIncrement).toHaveBeenCalledWith(
      METRIC_NAMES.mensagemErroConsumo,
      1,
      expect.arrayContaining(['tipo:transitorio']),
    );
    const tags = mockIncrement.mock.calls.flatMap((c) => c[2] as string[]);
    expect(tags.some((t) => t.startsWith('correlationId:'))).toBe(false);
  });

  it('registra backlog da outbox em gauge', async () => {
    await service.recordOutboxBacklog(5000);

    expect(mockGauge).toHaveBeenCalledWith(
      METRIC_NAMES.outboxPendentes,
      3,
      expect.any(Array),
    );
    expect(mockGauge).toHaveBeenCalledWith(
      METRIC_NAMES.outboxIdadeMaisAntigaSegundos,
      expect.any(Number),
      expect.any(Array),
    );
  });

  it('limita a execução das consultas do backlog ao prazo informado', async () => {
    await service.recordOutboxBacklog(1234);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 1234,
    });
  });

  it('não propaga falha do banco ao registrar o backlog', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('timeout'));

    await expect(service.recordOutboxBacklog(5000)).resolves.toBeUndefined();
    expect(mockGauge).not.toHaveBeenCalled();
  });
});
