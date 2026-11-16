import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FilaMensagensGateway,
  MensagemFilaRecebida,
} from '../../application/ports/fila-mensagens.gateway';

@Injectable()
export class FilaSqsGateway implements FilaMensagensGateway {
  private readonly client: SQSClient;
  private readonly waitTimeSeconds: number;

  constructor(configService: ConfigService) {
    const region = configService.get<string>('AWS_REGION') ?? 'us-east-1';
    this.client = new SQSClient({ region });
    this.waitTimeSeconds = Number(
      configService.get<string>('SQS_LONG_POLL_SECONDS') ?? '10',
    );
  }

  async receber(
    filaUrl: string,
    quantidadeMaxima = 10,
  ): Promise<MensagemFilaRecebida[]> {
    const resposta = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: filaUrl,
        MaxNumberOfMessages: quantidadeMaxima,
        WaitTimeSeconds: this.waitTimeSeconds,
        MessageAttributeNames: ['All'],
      }),
    );

    return (resposta.Messages ?? [])
      .filter((m) => m.Body && m.ReceiptHandle)
      .map((m) => ({
        corpo: m.Body as string,
        receiptHandle: m.ReceiptHandle as string,
      }));
  }

  async confirmar(filaUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: filaUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  async enviar(
    filaUrl: string,
    envelope: unknown,
    correlationId: string,
  ): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: filaUrl,
        MessageBody: JSON.stringify(envelope),
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
