export const EVENTO_STATUS_CHANGED = 'ordem-servico.status-changed.v1';
export const COMANDO_INICIAR_DIAGNOSTICO = 'execution.iniciar-diagnostico.v1';
export const COMANDO_INICIAR_REPARO = 'execution.iniciar-reparo.v1';
export const COMANDO_CANCELAR_TAREFA = 'execution.cancelar-tarefa.v1';
export const EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO =
  'execution.resposta-cancelamento.v1';
export const EVENTO_REPARO_FALHOU = 'execution.reparo-falhou.v1';
export const EVENTO_REPARO_INTERROMPIDO = 'execution.reparo-interrompido.v1';
export const EVENTO_DIAGNOSTICO_INICIADO = 'execution.diagnostico-iniciado.v1';
export const EVENTO_TAREFA_DEVOLVIDA_A_FILA =
  'execution.tarefa-devolvida-a-fila.v1';
export const EVENTO_REPARO_INICIADO = 'execution.reparo-iniciado.v1';
export const EVENTO_REPARO_CONCLUIDO = 'execution.reparo-concluido.v1';
export const COMANDO_GERAR_ORCAMENTO = 'billing.gerar-orcamento.v1';
export const COMANDO_CANCELAR_FINANCEIRO = 'billing.cancelar-financeiro.v1';
export const COMANDO_CONSULTAR_SITUACAO_FINANCEIRA =
  'billing.consultar-situacao-financeira.v1';
export const EVENTO_PAGAMENTO_DISPONIVEL =
  'ordem-servico.pagamento-disponivel.v1';

export const EVENTO_ORCAMENTO_GERADO = 'billing.orcamento-gerado.v1';
export const EVENTO_ORCAMENTO_REJEITADO = 'billing.orcamento-rejeitado.v1';
export const EVENTO_COBRANCA_CRIADA = 'billing.cobranca-criada.v1';
export const EVENTO_PAGAMENTO_CONFIRMADO = 'billing.pagamento-confirmado.v1';
export const EVENTO_RESPOSTA_CANCELAMENTO =
  'billing.resposta-cancelamento-financeiro.v1';
export const EVENTO_PENDENCIA_RESOLVIDA = 'billing.pendencia-resolvida.v1';
export const EVENTO_ESTORNO_CONCLUIDO = 'billing.estorno-concluido.v1';
export const EVENTO_COBRANCA_EXPIRADA = 'billing.cobranca-expirada.v1';
export const EVENTO_PAGAMENTO_TARDIO_REGISTRADO =
  'billing.pagamento-tardio-registrado.v1';
export const EVENTO_SITUACAO_FINANCEIRA = 'billing.situacao-financeira.v1';

export const DESTINO_FILA_BILLING = 'billing-in';
export const DESTINO_FILA_EXECUTION = 'execution-in';
export const DESTINO_TOPICO_NOTIFICACAO = 'sns-notificacao';

export interface EnvelopeMensagem<T = unknown> {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  source: string;
  correlationId: string;
  causationId: string | null;
  ordemServicoId: string;
  rodada: number;
  payload: T;
}
