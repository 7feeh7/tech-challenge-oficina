import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { SendGridNotificadorStatusGateway } from './sendgrid-notificador-status.gateway';

jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: { setApiKey: jest.fn(), send: jest.fn() },
}));

import sendgrid from '@sendgrid/mail';

const enviar = sendgrid.send as jest.Mock;

const configComSendGrid = {
  get: jest.fn((chave: string) =>
    chave === 'SENDGRID_API_KEY' ? 'SG.chave-de-teste' : 'oficina@oficina.com',
  ),
} as unknown as ConfigService;

const configSemSendGrid = {
  get: jest.fn().mockReturnValue(undefined),
} as unknown as ConfigService;

const notificacao = {
  ordemServicoId: 'uuid-os1',
  destinatario: { nome: 'João Silva', email: 'joao@email.com' },
  numeroOS: 42,
  statusAnterior: StatusOS.RECEBIDA,
  statusNovo: StatusOS.EM_EXECUCAO,
};

describe('SendGridNotificadorStatusGateway', () => {
  beforeAll(() => {
    // os casos abaixo exercitam os caminhos de falha; o log deles é esperado
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(() => jest.clearAllMocks());

  it('envia o e-mail para o cliente com o novo status no assunto', async () => {
    enviar.mockResolvedValue([{ statusCode: 202 }]);
    const notificador = new SendGridNotificadorStatusGateway(configComSendGrid);

    await notificador.notificarMudancaDeStatus(notificacao);

    expect(enviar).toHaveBeenCalledTimes(1);
    const email = enviar.mock.calls[0][0] as Record<string, string>;
    expect(email.to).toBe('joao@email.com');
    expect(email.from).toBe('oficina@oficina.com');
    expect(email.subject).toBe('OS #42: Em execução');
    expect(email.text).toContain('João Silva');
    expect(email.text).toContain('Em execução');
  });

  it('não derruba a atualização da OS quando o SendGrid falha', async () => {
    enviar.mockRejectedValue(new Error('SendGrid fora do ar'));
    const notificador = new SendGridNotificadorStatusGateway(configComSendGrid);

    // a OS já foi persistida: o e-mail é best-effort e não pode propagar erro
    await expect(
      notificador.notificarMudancaDeStatus(notificacao),
    ).resolves.toBeUndefined();
  });

  it('não tenta enviar quando o SendGrid não está configurado', async () => {
    const notificador = new SendGridNotificadorStatusGateway(configSemSendGrid);

    await notificador.notificarMudancaDeStatus(notificacao);

    expect(enviar).not.toHaveBeenCalled();
  });

  it('não tenta enviar quando o cliente não tem e-mail cadastrado', async () => {
    const notificador = new SendGridNotificadorStatusGateway(configComSendGrid);

    await notificador.notificarMudancaDeStatus({
      ...notificacao,
      destinatario: { nome: 'João Silva', email: '' },
    });

    expect(enviar).not.toHaveBeenCalled();
  });
});
