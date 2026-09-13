import { StatusOS } from '../../domain/status-os';

export interface NotificacaoDeStatus {
  ordemServicoId: string;
  destinatario: { nome: string; email: string };
  numeroOS?: number;
  statusAnterior: StatusOS | null;
  statusNovo: StatusOS;
}

/**
 * Porta de saída para avisar o cliente quando a OS muda de status.
 * O caso de uso não sabe se o aviso vai por e-mail, SMS ou webhook.
 */
export interface NotificadorDeStatusGateway {
  notificarMudancaDeStatus(notificacao: NotificacaoDeStatus): Promise<void>;
}
