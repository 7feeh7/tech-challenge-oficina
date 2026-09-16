import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { IntegrationMetricsService } from '@/shared/observability/integration-metrics.service';
import { buildStatusChangedEvent } from '../../application/events/build-status-changed-event';
import {
  NotificacaoDeStatus,
  NotificadorDeStatusGateway,
} from '../../application/ports/notificador-status.gateway';

@Injectable()
export class SnsNotificadorStatusGateway implements NotificadorDeStatusGateway {
  private readonly snsClient: SNSClient;
  private readonly topicArn?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: JsonLoggerService,
    private readonly integrationMetrics: IntegrationMetricsService,
  ) {
    this.topicArn = this.configService.get<string>('SNS_NOTIFICACAO_TOPIC_ARN');
    this.snsClient = new SNSClient({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    });
  }

  async notificarMudancaDeStatus(
    notificacao: NotificacaoDeStatus,
  ): Promise<void> {
    if (!this.topicArn) {
      this.logger.error(
        'SNS_NOTIFICACAO_TOPIC_ARN não configurado: evento de status não publicado.',
      );
      return;
    }

    if (!notificacao.destinatario.email) {
      this.logger.warn(
        `Cliente sem e-mail cadastrado: evento da OS ${notificacao.numeroOS ?? notificacao.ordemServicoId} não publicado.`,
      );
      return;
    }

    const event = buildStatusChangedEvent(notificacao);
    const startedAt = Date.now();

    try {
      await this.snsClient.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Message: JSON.stringify(event),
          MessageAttributes: {
            eventType: {
              DataType: 'String',
              StringValue: event.eventType,
            },
            correlationId: {
              DataType: 'String',
              StringValue: event.correlationId,
            },
          },
        }),
      );

      this.integrationMetrics.recordSuccess('sns', Date.now() - startedAt);
      this.logger.logWithMeta(
        'info',
        'notificacao_status_publicada',
        {
          eventId: event.eventId,
          statusNovo: event.statusNovo,
        },
        SnsNotificadorStatusGateway.name,
      );
    } catch (error) {
      this.integrationMetrics.recordFailure('sns', Date.now() - startedAt);
      this.logger.logWithMeta(
        'error',
        'notificacao_status_falha_publicacao',
        {
          eventId: event.eventId,
          statusNovo: event.statusNovo,
          erro: error instanceof Error ? error.message : String(error),
        },
        SnsNotificadorStatusGateway.name,
      );
    }
  }
}
