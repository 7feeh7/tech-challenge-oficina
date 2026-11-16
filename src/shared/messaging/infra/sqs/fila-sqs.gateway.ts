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
  OpcoesReceberFila,
} from '../../application/ports/fila-mensagens.gateway';
import { criarOpcoesClienteSqs } from '../aws/config-cliente-mensageria-aws';
import { sinalOperacaoAws } from '../aws/sinal-operacao-aws';

@Injectable()
export class FilaSqsGateway implements FilaMensagensGateway {
  private readonly client: SQSClient;
  private readonly waitTimeSeconds: number;
  private readonly operationDeadlineMs: number;

  constructor(configService: ConfigService) {
    const opcoes = criarOpcoesClienteSqs(configService);
    this.operationDeadlineMs = opcoes.operationDeadlineMs;
    this.client = new SQSClient({
      region: opcoes.region,
      maxAttempts: opcoes.maxAttempts,
      requestHandler: opcoes.requestHandler,
    });
    this.waitTimeSeconds = Number(
      configService.get<string>('SQS_LONG_POLL_SECONDS') ?? '10',
    );
  }

  async receber(
    filaUrl: string,
    quantidadeMaxima = 10,
    opcoes?: OpcoesReceberFila,
  ): Promise<MensagemFilaRecebida[]> {
    const resposta = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: filaUrl,
        MaxNumberOfMessages: quantidadeMaxima,
        WaitTimeSeconds: this.waitTimeSeconds,
        MessageAttributeNames: ['All'],
      }),
      {
        abortSignal: sinalOperacaoAws(
          this.operationDeadlineMs,
          opcoes?.sinalAbortamento,
        ),
      },
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
      {
        abortSignal: sinalOperacaoAws(this.operationDeadlineMs),
      },
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
      {
        abortSignal: sinalOperacaoAws(this.operationDeadlineMs),
      },
    );
  }

  async enviarCorpoBruto(
    filaUrl: string,
    corpo: string,
    correlationId: string,
  ): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: filaUrl,
        MessageBody: corpo,
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
