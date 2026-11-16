jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PublishCommand: jest.fn().mockImplementation((i) => i),
}));

import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { ConfigService } from '@nestjs/config';
import { TopicoNotificacaoSnsGateway } from './topico-notificacao-sns.gateway';

describe('TopicoNotificacaoSnsGateway', () => {
  it('publica envelope no tópico configurado', async () => {
    const send = jest.fn().mockResolvedValue({});
    (SNSClient as jest.Mock).mockImplementation(() => ({ send }));

    const gateway = new TopicoNotificacaoSnsGateway({
      get: jest.fn().mockReturnValue('us-east-1'),
      getOrThrow: jest.fn().mockReturnValue('arn:sns:topico'),
    } as unknown as ConfigService);

    await gateway.publicar({ eventType: 'x' }, 'corr');

    expect(PublishCommand).toHaveBeenCalled();
    expect(send).toHaveBeenCalled();
  });
});