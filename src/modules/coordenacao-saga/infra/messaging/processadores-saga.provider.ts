import { Injectable } from '@nestjs/common';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_ORCAMENTO_REJEITADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_INICIADO,
  EVENTO_TAREFA_DEVOLVIDA_A_FILA,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import type { ProcessadorMensagem } from '@/shared/messaging/application/ports/processador-mensagem.port';
import { ReagirFatoSagaUseCase } from '../../application/use-cases/reagir-fato-saga.use-case';

function criarProcessador(
  eventType: string,
  saga: ReagirFatoSagaUseCase,
): ProcessadorMensagem {
  return {
    eventType,
    processar: (contexto: ContextoTransacao, envelope: EnvelopeMensagem) =>
      saga.executar(contexto, envelope),
  };
}

@Injectable()
export class ProcessadoresSagaProvider {
  readonly lista: ProcessadorMensagem[];

  constructor(saga: ReagirFatoSagaUseCase) {
    this.lista = [
      EVENTO_DIAGNOSTICO_INICIADO,
      EVENTO_TAREFA_DEVOLVIDA_A_FILA,
      EVENTO_ORCAMENTO_GERADO,
      EVENTO_ORCAMENTO_REJEITADO,
      EVENTO_PAGAMENTO_CONFIRMADO,
      EVENTO_REPARO_INICIADO,
      EVENTO_REPARO_CONCLUIDO,
    ].map((eventType) => criarProcessador(eventType, saga));
  }
}
