import { randomUUID } from 'node:crypto';
import {
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_FALHOU,
  EVENTO_REPARO_INTERROMPIDO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';

export const QUANDO_ENCERRAMENTO_E42 = '2026-06-15T14:00:00.000Z';

export function montarEnvelopeE42(
  eventType: string,
  ordemServicoId: string,
  correlationId: string,
  rodada: number,
  payload: Record<string, unknown>,
  eventId = randomUUID(),
  occurredAt?: string,
): string {
  return JSON.stringify({
    eventId,
    eventType,
    version: 1,
    occurredAt: occurredAt ?? new Date().toISOString(),
    source: 'teste-e42',
    correlationId,
    causationId: null,
    ordemServicoId,
    rodada,
    payload,
  });
}

export function payloadReparoConcluidoE42(
  pecaId: string,
  quantidade: number,
  fatoTerminalEventId = randomUUID(),
) {
  return {
    tipoTarefa: 'REPARO',
    resultado: 'JA_CONCLUIDA',
    situacaoTarefa: 'CONCLUIDA',
    concluidaEm: QUANDO_ENCERRAMENTO_E42,
    encerradaEm: QUANDO_ENCERRAMENTO_E42,
    fatoTerminalEventId,
    pecasUtilizadas: quantidade ? [{ itemId: pecaId, quantidade }] : [],
    servicosRealizados: [],
    divergencias: [],
  };
}

export function payloadReparoEncerradoE42(
  pecaId: string,
  quantidade: number,
  situacao: 'FALHOU' | 'INTERROMPIDA',
  fatoTerminalEventId = randomUUID(),
  motivo = 'motivo de teste',
) {
  return {
    tipoTarefa: 'REPARO',
    resultado: 'JA_ENCERRADA',
    situacaoTarefa: situacao,
    encerradaEm: QUANDO_ENCERRAMENTO_E42,
    fatoTerminalEventId,
    motivo,
    pecasUtilizadas: [{ itemId: pecaId, quantidade }],
    servicosRealizados: [],
    divergencias: [],
  };
}

export function payloadReparoCanceladoE42() {
  return {
    tipoTarefa: 'REPARO',
    resultado: 'JA_ENCERRADA',
    situacaoTarefa: 'CANCELADA',
    encerradaEm: QUANDO_ENCERRAMENTO_E42,
    pecasUtilizadas: [],
    servicosRealizados: [],
    divergencias: [],
  };
}

export function payloadDiagnosticoE42(resultado: 'JA_CONCLUIDA' | 'CANCELADA') {
  if (resultado === 'JA_CONCLUIDA') {
    return {
      tipoTarefa: 'DIAGNOSTICO',
      resultado,
      situacaoTarefa: 'CONCLUIDA',
      concluidaEm: QUANDO_ENCERRAMENTO_E42,
      encerradaEm: QUANDO_ENCERRAMENTO_E42,
    };
  }
  return {
    tipoTarefa: 'DIAGNOSTICO',
    resultado: 'JA_ENCERRADA',
    situacaoTarefa: 'CANCELADA',
    encerradaEm: QUANDO_ENCERRAMENTO_E42,
  };
}

export const EVENTOS_TERMINAIS_E42 = {
  REPARO_CONCLUIDO: EVENTO_REPARO_CONCLUIDO,
  REPARO_FALHOU: EVENTO_REPARO_FALHOU,
  REPARO_INTERROMPIDO: EVENTO_REPARO_INTERROMPIDO,
  RESPOSTA: EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} as const;

export async function contarPendenciaNatureza(
  prisma: {
    pendenciaOs: {
      findMany: (args: unknown) => Promise<{ detalhes: unknown }[]>;
    };
  },
  ordemServicoId: string,
  natureza: string,
): Promise<number> {
  const abertas = await prisma.pendenciaOs.findMany({
    where: {
      ordemServicoId,
      tipo: 'INVENTARIO',
      resolvida: false,
    },
  });
  return abertas.filter(
    (p) => (p.detalhes as { natureza?: string })?.natureza === natureza,
  ).length;
}
