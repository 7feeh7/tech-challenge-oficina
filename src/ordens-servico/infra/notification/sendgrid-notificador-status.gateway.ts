import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sendgrid from '@sendgrid/mail';
import {
  NotificacaoDeStatus,
  NotificadorDeStatusGateway,
} from '../../application/ports/notificador-status.gateway';
import { StatusOS } from '../../domain/status-os';

const DESCRICAO_DO_STATUS: Record<StatusOS, string> = {
  [StatusOS.RECEBIDA]: 'Recebida',
  [StatusOS.EM_DIAGNOSTICO]: 'Em diagnóstico',
  [StatusOS.AGUARDANDO_APROVACAO]: 'Aguardando aprovação do orçamento',
  [StatusOS.EM_EXECUCAO]: 'Em execução',
  [StatusOS.FINALIZADA]: 'Finalizada',
  [StatusOS.ENTREGUE]: 'Entregue',
};

/**
 * Envia o aviso de mudança de status por e-mail (SendGrid).
 *
 * A notificação é *best-effort*: uma falha no provedor não pode derrubar a
 * atualização da OS, que já foi persistida. Por isso o erro é registrado no log
 * em vez de propagado.
 */
@Injectable()
export class SendGridNotificadorStatusGateway implements NotificadorDeStatusGateway {
  private readonly logger = new Logger(SendGridNotificadorStatusGateway.name);
  private readonly apiKey?: string;
  private readonly remetente?: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    this.remetente = this.configService.get<string>('SENDGRID_FROM_EMAIL');

    if (this.apiKey) {
      sendgrid.setApiKey(this.apiKey);
    }
  }

  async notificarMudancaDeStatus(
    notificacao: NotificacaoDeStatus,
  ): Promise<void> {
    if (!this.estaConfigurado()) {
      this.logger.warn(
        'SENDGRID_API_KEY/SENDGRID_FROM_EMAIL não configurados: notificação de status não enviada.',
      );
      return;
    }

    if (!notificacao.destinatario.email) {
      this.logger.warn(
        `Cliente sem e-mail cadastrado: notificação da OS ${notificacao.numeroOS ?? '?'} não enviada.`,
      );
      return;
    }

    try {
      await sendgrid.send({
        to: notificacao.destinatario.email,
        from: this.remetente!,
        subject: this.montarAssunto(notificacao),
        text: this.montarTextoSimples(notificacao),
        html: this.montarHtml(notificacao),
      });

      this.logger.log(
        `Notificação da OS ${notificacao.numeroOS ?? '?'} enviada para ${notificacao.destinatario.email}.`,
      );
    } catch (error) {
      // A OS já foi atualizada; o e-mail é um efeito colateral que pode falhar.
      this.logger.error(
        `Falha ao notificar a mudança de status da OS ${notificacao.numeroOS ?? '?'}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private estaConfigurado(): boolean {
    return Boolean(this.apiKey && this.remetente);
  }

  private montarAssunto({ numeroOS, statusNovo }: NotificacaoDeStatus): string {
    const identificacao = numeroOS ? `OS #${numeroOS}` : 'Sua ordem de serviço';
    return `${identificacao}: ${DESCRICAO_DO_STATUS[statusNovo]}`;
  }

  private montarTextoSimples(notificacao: NotificacaoDeStatus): string {
    const { destinatario, numeroOS, statusAnterior, statusNovo } = notificacao;
    const identificacao = numeroOS ? `OS #${numeroOS}` : 'sua ordem de serviço';
    const anterior = statusAnterior
      ? ` (antes: ${DESCRICAO_DO_STATUS[statusAnterior]})`
      : '';

    return [
      `Olá, ${destinatario.nome}.`,
      '',
      `A ${identificacao} está agora com o status: ${DESCRICAO_DO_STATUS[statusNovo]}${anterior}.`,
      '',
      'Oficina Mecânica',
    ].join('\n');
  }

  private montarHtml(notificacao: NotificacaoDeStatus): string {
    const { destinatario, numeroOS, statusAnterior, statusNovo } = notificacao;
    const identificacao = numeroOS ? `OS #${numeroOS}` : 'sua ordem de serviço';
    const anterior = statusAnterior
      ? `<p>Status anterior: ${DESCRICAO_DO_STATUS[statusAnterior]}</p>`
      : '';

    return [
      `<p>Olá, ${destinatario.nome}.</p>`,
      `<p>A <strong>${identificacao}</strong> está agora com o status: <strong>${DESCRICAO_DO_STATUS[statusNovo]}</strong>.</p>`,
      anterior,
      '<p>Oficina Mecânica</p>',
    ].join('');
  }
}
