import { randomUUID } from 'node:crypto';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';
import {
  carregarExemplo,
  descreverDiferencaDeFormato,
  type ServicoContrato,
} from '../../helpers/exemplos-contrato';

export interface IdentidadeDaMensagem {
  ordemServicoId: string;
  correlationId: string;
  rodada: number;
  causationId?: string | null;
}

export interface ConteudoDaMensagem {
  payload?: Record<string, unknown>;
  omitirDoPayload?: string[];
}

/**
 * Monta a mensagem que o Billing ou o Execution enviam ao OS partindo do
 * exemplo publicado pelo dono do contrato: troca só a identidade da instância
 * e o conteúdo informado, e recusa qualquer formato diferente do exemplo.
 */
export function montarMensagemDoExemplo(
  servico: ServicoContrato,
  nomeExemplo: string,
  identidade: IdentidadeDaMensagem,
  conteudo: ConteudoDaMensagem = {},
): EnvelopeMensagem<Record<string, unknown>> {
  const exemplo = carregarExemplo(servico, nomeExemplo).envelope;
  const payload: Record<string, unknown> = {
    ...exemplo.payload,
    ...conteudo.payload,
  };
  for (const campo of conteudo.omitirDoPayload ?? []) {
    delete payload[campo];
  }

  const payloadReferencia: Record<string, unknown> = { ...exemplo.payload };
  for (const campo of conteudo.omitirDoPayload ?? []) {
    delete payloadReferencia[campo];
  }
  const diferencas = descreverDiferencaDeFormato(payloadReferencia, payload);
  if (diferencas.length > 0) {
    throw new Error(
      `Mensagem simulada fora do formato de ${nomeExemplo}: ${diferencas.join('; ')}`,
    );
  }

  return {
    eventId: randomUUID(),
    eventType: exemplo.eventType,
    version: exemplo.version,
    occurredAt: new Date().toISOString(),
    source: exemplo.source,
    correlationId: identidade.correlationId,
    causationId: identidade.causationId ?? null,
    ordemServicoId: identidade.ordemServicoId,
    rodada: identidade.rodada,
    payload,
  };
}

export function verificarFormatoDoComando(
  servico: ServicoContrato,
  nomeExemplo: string,
  emitido: EnvelopeMensagem,
): void {
  const exemplo = carregarExemplo(servico, nomeExemplo).envelope;
  const diferencas = descreverDiferencaDeFormato(exemplo, emitido);
  if (diferencas.length > 0) {
    throw new Error(
      `Comando emitido pelo OS fora do formato de ${nomeExemplo}: ${diferencas.join('; ')}`,
    );
  }
  if (
    emitido.eventType !== exemplo.eventType ||
    emitido.source !== exemplo.source
  ) {
    throw new Error(
      `Comando emitido pelo OS com eventType ou source diferentes de ${nomeExemplo}`,
    );
  }
}

export interface InstanciaDoExemplo {
  ordemServicoId: string;
  correlationId: string;
  /** Troca de valores de instância (ids de peça, consulta) feita no texto inteiro do exemplo. */
  substituicoes?: Record<string, string>;
}

/**
 * Entrega o exemplo publicado como ele é, trocando só o que identifica a
 * instância: ordem, correlação, `eventId` e `fatoTerminalEventId`. Os dois
 * identificadores de evento trocam juntos, para que a resposta continue
 * apontando para o `eventId` do fato terminal.
 */
export function instanciarExemplo(
  servico: ServicoContrato,
  nomeExemplo: string,
  instancia: InstanciaDoExemplo,
): EnvelopeMensagem<Record<string, unknown>> {
  const exemplo = carregarExemplo(servico, nomeExemplo).envelope;
  const trocas: Record<string, string> = {
    [exemplo.ordemServicoId]: instancia.ordemServicoId,
  };
  const idsDeEvento = [
    exemplo.eventId,
    (exemplo.payload as { fatoTerminalEventId?: string }).fatoTerminalEventId,
  ].filter((id): id is string => Boolean(id));
  for (const id of idsDeEvento) {
    trocas[id] = randomUUID();
  }
  Object.assign(trocas, instancia.substituicoes);

  let texto = JSON.stringify(exemplo);
  for (const [de, para] of Object.entries(trocas)) {
    texto = texto.split(de).join(para);
  }
  const instanciado = JSON.parse(texto) as EnvelopeMensagem<
    Record<string, unknown>
  >;
  instanciado.ordemServicoId = instancia.ordemServicoId;
  instanciado.correlationId = instancia.correlationId;
  return instanciado;
}
