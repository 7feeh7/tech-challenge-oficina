jest.mock('../aws/sinal-operacao-aws', () => ({
  sinalOperacaoAws: jest.fn((_deadline: number, externo?: AbortSignal) => {
    const c = new AbortController();
    if (externo?.aborted) c.abort();
    return c.signal;
  }),
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  SendMessageCommand: jest.fn().mockImplementation((i) => i),
  ReceiveMessageCommand: jest.fn().mockImplementation((i) => i),
  DeleteMessageCommand: jest.fn().mockImplementation((i) => i),
}));

import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { ConfigService } from '@nestjs/config';
import { FilaSqsGateway } from './fila-sqs.gateway';

describe('FilaSqsGateway', () => {
  const send = jest.fn();
  (SQSClient as jest.Mock).mockImplementation(() => ({ send }));

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockResolvedValue({ Messages: [] });
  });

  it('envia mensagem com atributo correlationId', async () => {
    const gateway = new FilaSqsGateway({
      get: jest.fn((k: string) => {
        if (k === 'AWS_REGION') return 'us-east-1';
        return undefined;
      }),
    } as unknown as ConfigService);

    await gateway.enviar('url', { eventType: 'x' }, 'corr-1');

    expect(SendMessageCommand).toHaveBeenCalled();
    expect(send).toHaveBeenCalled();
  });

  it('envia corpo bruto à DLQ sem nova serialização', async () => {
    const corpo = '{"a":1}';
    const gateway = new FilaSqsGateway({
      get: jest.fn((k: string) => {
        if (k === 'AWS_REGION') return 'us-east-1';
        return undefined;
      }),
    } as unknown as ConfigService);

    await gateway.enviarCorpoBruto('url-dlq', corpo, 'corr-dlq');

    expect(SendMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        QueueUrl: 'url-dlq',
        MessageBody: corpo,
      }),
    );
  });

  it('recebe e confirma mensagens', async () => {
    send
      .mockResolvedValueOnce({
        Messages: [{ Body: '{}', ReceiptHandle: 'rh' }],
      })
      .mockResolvedValueOnce({});
    const gateway = new FilaSqsGateway({
      get: jest.fn((k: string) => {
        if (k === 'AWS_REGION') return 'us-east-1';
        return undefined;
      }),
    } as unknown as ConfigService);

    const recebidas = await gateway.receber('url');
    expect(recebidas).toHaveLength(1);
    await gateway.confirmar('url', 'rh');
    expect(DeleteMessageCommand).toHaveBeenCalled();
    expect(ReceiveMessageCommand).toHaveBeenCalled();
  });
});
