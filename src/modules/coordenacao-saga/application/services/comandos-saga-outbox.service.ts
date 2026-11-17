import { randomUUID } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  DESTINO_FILA_BILLING,
  DESTINO_FILA_EXECUTION,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import type { OrdemServicoBloqueada } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { FinalidadeConsultaFinanceira } from '../../domain/consulta-financeira';
import {
  ResultadoExecucaoCompensacao,
  TipoPedidoSaga,
} from '@/shared/generated/prisma/enums';
import type { PedidoEmitidoGateway } from '../ports/pedido-emitido.gateway';
import type { TipoTarefaCancelamento } from '../../domain/resultado-cancelamento-execucao';

const ORIGEM_OS = 'os-service';

export class ComandosSagaOutboxService {
  constructor(
    private readonly outbox: OutboxGateway,
    private readonly pedidos: PedidoEmitidoGateway,
  ) {}

  async emitirCancelarTarefa(
    contexto: ContextoTransacao,
    bloqueada: OrdemServicoBloqueada,
    causationId: string,
    tipoTarefa: TipoTarefaCancelamento,
    motivo: string,
  ): Promise<string> {
    const eventId = randomUUID();
    const envelope: EnvelopeMensagem = {
      eventId,
      eventType: COMANDO_CANCELAR_TAREFA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: ORIGEM_OS,
      correlationId: bloqueada.ordem.correlationId,
      causationId,
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      payload: { tipoTarefa, motivo },
    };
    await this.outbox.registrar(contexto, {
      eventId,
      eventType: COMANDO_CANCELAR_TAREFA,
      envelope,
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_FILA_EXECUTION,
    });
    await this.pedidos.registrar(contexto, {
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      tipo: TipoPedidoSaga.CANCELAR_TAREFA,
      destino: DESTINO_FILA_EXECUTION,
      eventId,
    });
    return eventId;
  }

  async emitirConsultarSituacaoFinanceira(
    contexto: ContextoTransacao,
    bloqueada: OrdemServicoBloqueada,
    causationId: string,
    consultaId: string,
    finalidade: FinalidadeConsultaFinanceira,
  ): Promise<string> {
    const eventId = randomUUID();
    const envelope: EnvelopeMensagem = {
      eventId,
      eventType: COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: ORIGEM_OS,
      correlationId: bloqueada.ordem.correlationId,
      causationId,
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      payload: { consultaId, finalidade },
    };
    await this.outbox.registrar(contexto, {
      eventId,
      eventType: COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
      envelope,
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_FILA_BILLING,
    });
    await this.pedidos.registrar(contexto, {
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      tipo: TipoPedidoSaga.CONSULTAR_SITUACAO_FINANCEIRA,
      destino: DESTINO_FILA_BILLING,
      eventId,
    });
    return eventId;
  }

  async emitirCancelarFinanceiro(
    contexto: ContextoTransacao,
    bloqueada: OrdemServicoBloqueada,
    causationId: string,
    resultadoExecucao: ResultadoExecucaoCompensacao,
    motivo: string,
  ): Promise<string> {
    const etapaOrigem =
      bloqueada.ordem.etapaOrigemCancelamento ?? StatusOS.RECEBIDA;
    const eventId = randomUUID();
    const envelope: EnvelopeMensagem = {
      eventId,
      eventType: COMANDO_CANCELAR_FINANCEIRO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: ORIGEM_OS,
      correlationId: bloqueada.ordem.correlationId,
      causationId,
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      payload: { etapaOrigem, motivo, resultadoExecucao },
    };
    await this.outbox.registrar(contexto, {
      eventId,
      eventType: COMANDO_CANCELAR_FINANCEIRO,
      envelope,
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_FILA_BILLING,
    });
    await this.pedidos.registrar(contexto, {
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      tipo: TipoPedidoSaga.CANCELAR_FINANCEIRO,
      destino: DESTINO_FILA_BILLING,
      eventId,
    });
    return eventId;
  }
}
