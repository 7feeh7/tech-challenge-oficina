import { PublishCommand } from '@aws-sdk/client-sns';
import { ConfigService } from '@nestjs/config';
import { correlationIdStorage } from '@/shared/http/correlation-id.context';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { IntegrationMetricsService } from '@/shared/observability/integration-metrics.service';
import { SnsNotificadorStatusGateway } from './sns-notificador-status.gateway';

jest.mock('@aws-sdk/client-sns', () => {
  const send = jest.fn();
  return {
    SNSClient: jest.fn().mockImplementation(() => ({ send })),
    PublishCommand: jest.fn().mockImplementation((input) => input),
    __mockSend: send,
  };
});

const { __mockSend: mockSend } = jest.requireMock('@aws-sdk/client-sns');

const notificacao = {
  ordemServicoId: 'uuid-os1',
  destinatario: { nome: 'João Silva', email: 'joao@email.com' },
  numeroOS: 42,
  statusAnterior: StatusOS.RECEBIDA,
  statusNovo: StatusOS.EM_EXECUCAO,
};

const logger = {
  logWithMeta: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as JsonLoggerService;

const integrationMetrics = {
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
} as unknown as IntegrationMetricsService;

describe('SnsNotificadorStatusGateway', () => {
  beforeEach(() => jest.clearAllMocks());

  it('publishes a versioned event to SNS with correlation id', async () => {
    mockSend.mockResolvedValue({ MessageId: 'msg-1' });
    const config = {
      get: jest.fn((key: string) =>
        key === 'SNS_NOTIFICACAO_TOPIC_ARN'
          ? 'arn:aws:sns:us-east-1:123456789012:topic'
          : 'us-east-1',
      ),
    } as unknown as ConfigService;
    const gateway = new SnsNotificadorStatusGateway(
      config,
      logger,
      integrationMetrics,
    );

    await correlationIdStorage.run({ correlationId: 'corr-abc' }, () =>
      gateway.notificarMudancaDeStatus(notificacao),
    );

    expect(PublishCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TopicArn: 'arn:aws:sns:us-east-1:123456789012:topic',
      }),
    );
    const payload = JSON.parse(
      (PublishCommand as unknown as jest.Mock).mock.calls[0][0].Message,
    );
    expect(payload.correlationId).toBe('corr-abc');
    expect(payload.eventType).toBe('ordem-servico.status-changed.v1');
    expect(payload.ordemServicoId).toBe('uuid-os1');
  });

  it('does not throw when SNS publish fails', async () => {
    mockSend.mockRejectedValue(new Error('SNS indisponível'));
    const config = {
      get: jest.fn((key: string) =>
        key === 'SNS_NOTIFICACAO_TOPIC_ARN' ? 'arn:topic' : 'us-east-1',
      ),
    } as unknown as ConfigService;
    const gateway = new SnsNotificadorStatusGateway(
      config,
      logger,
      integrationMetrics,
    );

    await expect(
      gateway.notificarMudancaDeStatus(notificacao),
    ).resolves.toBeUndefined();
  });

  it('skips publish when topic arn is missing', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const gateway = new SnsNotificadorStatusGateway(
      config,
      logger,
      integrationMetrics,
    );

    await gateway.notificarMudancaDeStatus(notificacao);

    expect(mockSend).not.toHaveBeenCalled();
  });
});
