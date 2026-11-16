import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublicacaoNotificacaoGateway } from '../../application/ports/publicacao-notificacao.gateway';

@Injectable()
export class TopicoNotificacaoSnsGateway implements PublicacaoNotificacaoGateway {
  private readonly client: SNSClient;

  constructor(private readonly config: ConfigService) {
    const region = config.get<string>('AWS_REGION') ?? 'us-east-1';
    this.client = new SNSClient({ region });
  }

  async publicar(envelope: unknown, correlationId: string): Promise<void> {
    const topicArn = this.config.getOrThrow<string>(
      'SNS_NOTIFICACAO_TOPIC_ARN',
    );
    await this.client.send(
      new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(envelope),
        MessageAttributes: {
          correlationId: {
            DataType: 'String',
            StringValue: correlationId,
          },
        },
      }),
    );
  }
}
