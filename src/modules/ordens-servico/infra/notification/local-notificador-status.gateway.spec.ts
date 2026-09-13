import { Logger } from '@nestjs/common';
import { correlationIdStorage } from '@/shared/http/correlation-id.context';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { LocalNotificadorStatusGateway } from './local-notificador-status.gateway';

describe('LocalNotificadorStatusGateway', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  it('logs event without calling external services', async () => {
    const gateway = new LocalNotificadorStatusGateway();
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    await correlationIdStorage.run({ correlationId: 'corr-local' }, () =>
      gateway.notificarMudancaDeStatus({
        ordemServicoId: 'uuid-os1',
        destinatario: { nome: 'João', email: 'joao@email.com' },
        statusAnterior: StatusOS.RECEBIDA,
        statusNovo: StatusOS.EM_DIAGNOSTICO,
      }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"correlationId":"corr-local"'),
    );
  });
});
