import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFICADOR_STATUS_GATEWAY } from '../../application/ports/tokens';
import { LocalNotificadorStatusGateway } from './local-notificador-status.gateway';
import { SendGridNotificadorStatusGateway } from './sendgrid-notificador-status.gateway';
import { SnsNotificadorStatusGateway } from './sns-notificador-status.gateway';

export const notificadorStatusProvider: Provider = {
  provide: NOTIFICADOR_STATUS_GATEWAY,
  useFactory: (
    configService: ConfigService,
    snsGateway: SnsNotificadorStatusGateway,
    localGateway: LocalNotificadorStatusGateway,
    sendGridGateway: SendGridNotificadorStatusGateway,
  ) => {
    const transport = configService.get<string>(
      'NOTIFICACAO_TRANSPORT',
      'local',
    );

    switch (transport) {
      case 'sns':
        return snsGateway;
      case 'sendgrid':
        return sendGridGateway;
      default:
        return localGateway;
    }
  },
  inject: [
    ConfigService,
    SnsNotificadorStatusGateway,
    LocalNotificadorStatusGateway,
    SendGridNotificadorStatusGateway,
  ],
};
