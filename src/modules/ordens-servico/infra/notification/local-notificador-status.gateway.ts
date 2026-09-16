import { Injectable, Logger } from '@nestjs/common';
import { buildStatusChangedEvent } from '../../application/events/build-status-changed-event';
import {
  NotificacaoDeStatus,
  NotificadorDeStatusGateway,
} from '../../application/ports/notificador-status.gateway';

@Injectable()
export class LocalNotificadorStatusGateway implements NotificadorDeStatusGateway {
  private readonly logger = new Logger(LocalNotificadorStatusGateway.name);

  notificarMudancaDeStatus(notificacao: NotificacaoDeStatus): Promise<void> {
    if (!notificacao.destinatario.email) {
      this.logger.warn(
        `Cliente sem e-mail cadastrado: notificação local ignorada para OS ${notificacao.numeroOS ?? notificacao.ordemServicoId}.`,
      );
      return Promise.resolve();
    }

    const event = buildStatusChangedEvent(notificacao);

    this.logger.log(
      JSON.stringify({
        evento: 'notificacao_status_local',
        eventId: event.eventId,
        correlationId: event.correlationId,
        ordemServicoId: event.ordemServicoId,
        statusNovo: event.statusNovo,
        destinatarioEmail: event.destinatario.email.replace(
          /(.{2}).*(@.*)/,
          '$1***$2',
        ),
      }),
    );

    return Promise.resolve();
  }
}
