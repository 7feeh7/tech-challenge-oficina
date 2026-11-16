import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublicacaoNotificacaoGateway } from '../../application/ports/publicacao-notificacao.gateway';
import { criarOpcoesClienteSns } from '../aws/config-cliente-mensageria-aws';
import { sinalOperacaoAws } from '../aws/sinal-operacao-aws';

@Injectable()
export class TopicoNotificacaoSnsGateway implements PublicacaoNotificacaoGateway {
  private readonly client: SNSClient;
  private readonly operationDeadlineMs: number;

  constructor(private readonly config: ConfigService) {
    const opcoes = criarOpcoesClienteSns(config);
    this.operationDeadlineMs = opcoes.operationDeadlineMs;
    this.client = new SNSClient({
      region: opcoes.region,
      maxAttempts: opcoes.maxAttempts,
      requestHandler: opcoes.requestHandler,
    });
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
      {
        abortSignal: sinalOperacaoAws(this.operationDeadlineMs),
      },
    );
  }
}
