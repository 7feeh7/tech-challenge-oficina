import { NotificadorDeStatusGateway } from '@/modules/ordens-servico/application/ports/notificador-status.gateway';
import { TransicaoDaOrdem } from '../ports/orcamento.gateway';

/**
 * Avisa o cliente quando a decisão sobre o orçamento moveu a OS. Nada a fazer
 * se a OS não saiu do lugar — reenviar a mesma decisão não gera novo e-mail.
 */
export async function notificarTransicao(
  notificador: NotificadorDeStatusGateway,
  transicao?: TransicaoDaOrdem,
): Promise<void> {
  if (!transicao) return;

  await notificador.notificarMudancaDeStatus({
    destinatario: transicao.cliente,
    numeroOS: transicao.numeroOS,
    statusAnterior: transicao.statusAnterior,
    statusNovo: transicao.statusNovo,
  });
}
