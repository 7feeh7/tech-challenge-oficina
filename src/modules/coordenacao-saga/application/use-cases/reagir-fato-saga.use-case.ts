import { randomUUID } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { enrichObservabilityContext } from '@/shared/http/correlation-id.context';
import {
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_ORCAMENTO_REJEITADO,
  EVENTO_COBRANCA_CRIADA,
  EVENTO_COBRANCA_EXPIRADA,
  EVENTO_PAGAMENTO_DISPONIVEL,
  DESTINO_TOPICO_NOTIFICACAO,
  EVENTO_ESTORNO_CONCLUIDO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_PAGAMENTO_TARDIO_REGISTRADO,
  EVENTO_PENDENCIA_RESOLVIDA,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_FALHOU,
  EVENTO_REPARO_INICIADO,
  EVENTO_REPARO_INTERROMPIDO,
  EVENTO_RESPOSTA_CANCELAMENTO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
  EVENTO_SITUACAO_FINANCEIRA,
  EVENTO_TAREFA_DEVOLVIDA_A_FILA,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import { PassoCompensacaoSaga } from '@/shared/generated/prisma/enums';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import { DESTINO_FILA_EXECUTION } from '@/shared/messaging/envelope';
import {
  TipoPedidoSaga,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import { PrismaService } from '@/shared/database/prisma.service';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { ConsumirReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import type { ReservaEstoqueGateway } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ReservaJaProcessadaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { AcaoDecisao } from '../../domain/acao-decisao';
import { decidir } from '../../domain/decidir';
import type { OrdemParaDecisao } from '../../domain/ordem-para-decisao';
import { TipoFatoSaga } from '../../domain/tipo-fato-saga';
import type { PedidoEmitidoGateway } from '../ports/pedido-emitido.gateway';
import type { ProjecaoFinanceiraGateway } from '../ports/projecao-financeira.gateway';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import type { EstadoCompensacaoGateway } from '../ports/estado-compensacao.gateway';
import {
  CompensacaoSagaService,
  type RespostaCancelamentoFinanceiroPayload,
  type RespostaCancelamentoPayload,
  type SituacaoFinanceiraPayload,
} from '../services/compensacao-saga.service';
import { ConsultaPrazoReferenciaService } from '../services/consulta-prazo-referencia.service';
import { SituacaoPagamentoFinanceira } from '../../domain/consulta-financeira';

const MAPA_EVENTO_FATO: Record<string, TipoFatoSaga> = {
  [EVENTO_DIAGNOSTICO_INICIADO]: TipoFatoSaga.DIAGNOSTICO_INICIADO,
  [EVENTO_TAREFA_DEVOLVIDA_A_FILA]: TipoFatoSaga.TAREFA_DEVOLVIDA_A_FILA,
  [EVENTO_ORCAMENTO_GERADO]: TipoFatoSaga.ORCAMENTO_GERADO,
  [EVENTO_ORCAMENTO_REJEITADO]: TipoFatoSaga.ORCAMENTO_REJEITADO,
  [EVENTO_PAGAMENTO_CONFIRMADO]: TipoFatoSaga.PAGAMENTO_CONFIRMADO,
  [EVENTO_REPARO_INICIADO]: TipoFatoSaga.REPARO_INICIADO,
  [EVENTO_REPARO_CONCLUIDO]: TipoFatoSaga.REPARO_CONCLUIDO,
  [EVENTO_COBRANCA_CRIADA]: TipoFatoSaga.COBRANCA_CRIADA,
  [EVENTO_COBRANCA_EXPIRADA]: TipoFatoSaga.COBRANCA_EXPIRADA,
  [EVENTO_SITUACAO_FINANCEIRA]: TipoFatoSaga.SITUACAO_FINANCEIRA,
  [EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO]: TipoFatoSaga.RESPOSTA_CANCELAMENTO,
  [EVENTO_RESPOSTA_CANCELAMENTO]: TipoFatoSaga.RESPOSTA_CANCELAMENTO_FINANCEIRO,
  [EVENTO_REPARO_FALHOU]: TipoFatoSaga.REPARO_FALHOU,
  [EVENTO_REPARO_INTERROMPIDO]: TipoFatoSaga.REPARO_INTERROMPIDO,
  [EVENTO_ESTORNO_CONCLUIDO]: TipoFatoSaga.ESTORNO_CONCLUIDO,
  [EVENTO_PENDENCIA_RESOLVIDA]: TipoFatoSaga.PENDENCIA_RESOLVIDA,
  [EVENTO_PAGAMENTO_TARDIO_REGISTRADO]:
    TipoFatoSaga.PAGAMENTO_TARDIO_REGISTRADO,
};

interface PagamentoConfirmadoPayload {
  cobrancaId?: string;
  orderId: string;
  valorCentavos?: number;
}

interface DivergenciaReparoPayload {
  itemId: string;
  tipo?: string;
  quantidadePrevista?: number;
  quantidadeUtilizada?: number;
  observacao?: string;
  justificativa?: string;
}

interface ReparoExecucaoPayload {
  pecasUtilizadas?: { itemId: string; quantidade: number }[];
  divergencias?: DivergenciaReparoPayload[];
  responsavelId?: string;
  concluidoEm?: string;
  falhouEm?: string;
}

type ReparoConcluidoPayload = ReparoExecucaoPayload;

export class ReagirFatoSagaUseCase {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly transicoes: TransicaoOrdemServicoService,
    private readonly consumirReserva: ConsumirReservaEstoqueUseCase,
    private readonly reservas: ReservaEstoqueGateway,
    private readonly pedidos: PedidoEmitidoGateway,
    private readonly projecao: ProjecaoFinanceiraGateway,
    private readonly logger: JsonLoggerService,
    private readonly prisma: PrismaService,
    private readonly compensacao: CompensacaoSagaService,
    private readonly estadoCompensacao: EstadoCompensacaoGateway,
    private readonly outbox: OutboxGateway,
    private readonly consultaPrazo: ConsultaPrazoReferenciaService,
    private readonly osMetrics: OsMetricsService,
  ) {}

  async executar(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
  ): Promise<void> {
    const fato = MAPA_EVENTO_FATO[envelope.eventType];
    if (!fato) {
      return;
    }

    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      envelope.ordemServicoId,
    );
    if (!bloqueada) {
      throw new OrdemServicoNaoEncontradaError(envelope.ordemServicoId);
    }

    enrichObservabilityContext({
      correlationId: bloqueada.ordem.correlationId,
      ordemServicoId: envelope.ordemServicoId,
      eventId: envelope.eventId,
      causationId: envelope.causationId ?? undefined,
      eventType: envelope.eventType,
      rodada: envelope.rodada,
    });

    const payloadPagamento = envelope.payload as PagamentoConfirmadoPayload;
    const orderIdPrincipal = await this.projecao.buscarOrderIdPrincipal(
      contexto,
      envelope.ordemServicoId,
      envelope.rodada,
    );
    const payloadConsulta = envelope.payload as { consultaId?: string };
    const exigeEstadoCompensacao =
      bloqueada.ordem.status === StatusOS.EM_CANCELAMENTO ||
      fato === TipoFatoSaga.SITUACAO_FINANCEIRA ||
      fato === TipoFatoSaga.COBRANCA_EXPIRADA;
    const estadoSnap = exigeEstadoCompensacao
      ? await this.estadoCompensacao.obterOuCriar(
          contexto,
          envelope.ordemServicoId,
          bloqueada.ordem.rodadaVigente,
        )
      : null;
    const ordemDecisao: OrdemParaDecisao = {
      status: bloqueada.ordem.status,
      rodadaVigente: bloqueada.ordem.rodadaVigente,
      rodadaFato: envelope.rodada,
      orderIdFato: payloadPagamento.orderId ?? null,
      orderIdJaRegistrado: orderIdPrincipal,
      mesmoOrderId:
        Boolean(payloadPagamento.orderId) &&
        payloadPagamento.orderId === orderIdPrincipal,
      consultaIdVigente: estadoSnap?.consultaIdVigente ?? null,
      consultaIdFato: payloadConsulta.consultaId ?? null,
      emCompensacaoConsultaE10:
        estadoSnap?.passo === PassoCompensacaoSaga.CONSULTA_E10,
    };

    const acao = decidir(fato, ordemDecisao);
    const ocorridoEm = envelope.occurredAt
      ? new Date(envelope.occurredAt)
      : new Date();

    if (acao === AcaoDecisao.IGNORAR) {
      this.logger.logWithMeta(
        'info',
        'saga.fato.ignorado',
        {
          eventType: envelope.eventType,
          status: bloqueada.ordem.status,
          rodadaFato: envelope.rodada,
          rodadaVigente: bloqueada.ordem.rodadaVigente,
        },
        'CoordenacaoSaga',
      );
      return;
    }

    if (acao === AcaoDecisao.CONCILIAR) {
      await this.registrarPagamento(contexto, envelope, payloadPagamento);
      if (
        fato === TipoFatoSaga.PAGAMENTO_CONFIRMADO &&
        bloqueada.ordem.status === StatusOS.EM_CANCELAMENTO
      ) {
        await this.compensacao.avancarSeEmCancelamento(
          contexto,
          envelope.ordemServicoId,
          envelope.eventId,
        );
      }
      if (
        fato === TipoFatoSaga.PAGAMENTO_CONFIRMADO &&
        [StatusOS.FINALIZADA, StatusOS.CANCELADA, StatusOS.ENTREGUE].includes(
          bloqueada.ordem.status,
        )
      ) {
        await this.abrirPendenciaFinanceira(
          contexto,
          envelope,
          payloadPagamento,
        );
      }
      return;
    }

    switch (fato) {
      case TipoFatoSaga.DIAGNOSTICO_INICIADO:
        if (
          envelope.rodada >= 2 &&
          bloqueada.ordem.status === StatusOS.EM_DIAGNOSTICO
        ) {
          await this.transicoes.salvarSobBloqueio(
            contexto,
            envelope.ordemServicoId,
            () => {
              /* início da rodada ≥ 2 sem mudar status (D2.7) */
            },
          );
          break;
        }
        await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) => os.registrarDiagnosticoIniciado(quando),
          ocorridoEm,
          observacao: 'Diagnóstico iniciado (Execution)',
        });
        break;
      case TipoFatoSaga.TAREFA_DEVOLVIDA_A_FILA:
        await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) => os.registrarDevolucaoTarefaParaFila(quando),
          ocorridoEm,
          observacao: 'Tarefa devolvida à fila',
        });
        break;
      case TipoFatoSaga.ORCAMENTO_GERADO: {
        const payloadOrcamento = envelope.payload as {
          orcamentoId?: string;
          valorTotalCentavos?: number;
        };
        await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) => os.registrarOrcamentoGerado(quando),
          ocorridoEm,
          observacao: 'Orçamento gerado',
        });
        if (payloadOrcamento.orcamentoId) {
          await this.projecao.registrarOrcamento(contexto, {
            ordemServicoId: envelope.ordemServicoId,
            rodada: envelope.rodada,
            orcamentoId: payloadOrcamento.orcamentoId,
            valorTotalCentavos: payloadOrcamento.valorTotalCentavos ?? 0,
            eventId: envelope.eventId,
          });
        }
        break;
      }
      case TipoFatoSaga.ORCAMENTO_REJEITADO:
        await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) => os.registrarOrcamentoRejeitado(quando),
          ocorridoEm,
          observacao: 'Orçamento rejeitado — nova rodada',
        });
        break;
      case TipoFatoSaga.PAGAMENTO_CONFIRMADO: {
        await this.registrarPagamento(contexto, envelope, payloadPagamento);
        const resultado = await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) => os.registrarPagamentoConfirmado(quando),
          ocorridoEm,
          observacao: 'Pagamento confirmado',
        });
        if (resultado.mudouStatus && resultado.eventId) {
          const pedidoEventId =
            await this.transicoes.registrarIniciarReparoNaOutbox(
              contexto,
              resultado.bloqueada,
              resultado.eventId,
            );
          await this.pedidos.registrar(contexto, {
            ordemServicoId: envelope.ordemServicoId,
            rodada: envelope.rodada,
            tipo: TipoPedidoSaga.INICIAR_REPARO,
            destino: DESTINO_FILA_EXECUTION,
            eventId: pedidoEventId,
          });
        }
        break;
      }
      case TipoFatoSaga.REPARO_CONCLUIDO:
        await this.tratarReparoConcluido(contexto, envelope, ocorridoEm);
        break;
      case TipoFatoSaga.COBRANCA_CRIADA:
        await this.tratarCobrancaCriada(contexto, envelope, bloqueada);
        break;
      case TipoFatoSaga.COBRANCA_EXPIRADA: {
        const resultado = await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) =>
            os.registrarCompensacaoIniciada(
              'Prazo de pagamento expirado',
              quando,
            ),
          ocorridoEm,
          observacao: 'Cobrança expirada — compensação',
        });
        if (resultado.mudouStatus && resultado.eventId) {
          await this.compensacao.avancarAposEntradaEmCancelamento(contexto, {
            ordemServicoId: envelope.ordemServicoId,
            rodada: envelope.rodada,
            causationId: resultado.eventId,
          });
        }
        break;
      }
      case TipoFatoSaga.REPARO_INICIADO:
        if (bloqueada.ordem.status === StatusOS.EM_CANCELAMENTO) {
          await this.compensacao.registrarReparoIniciadoDuranteCancelamento(
            contexto,
            envelope.ordemServicoId,
          );
          break;
        }
        await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) => os.registrarReparoIniciado(quando),
          ocorridoEm,
          observacao: 'Reparo iniciado',
        });
        break;
      case TipoFatoSaga.RESPOSTA_CANCELAMENTO:
        await this.compensacao.tratarRespostaCancelamento(
          contexto,
          envelope.ordemServicoId,
          envelope.eventId,
          envelope.payload as RespostaCancelamentoPayload,
        );
        break;
      case TipoFatoSaga.RESPOSTA_CANCELAMENTO_FINANCEIRO:
        await this.compensacao.tratarRespostaCancelamentoFinanceiro(
          contexto,
          envelope.ordemServicoId,
          envelope.eventId,
          envelope.payload as RespostaCancelamentoFinanceiroPayload,
        );
        break;
      case TipoFatoSaga.SITUACAO_FINANCEIRA:
        await this.tratarSituacaoFinanceira(
          contexto,
          envelope,
          bloqueada.ordem.status,
          ocorridoEm,
        );
        break;
      case TipoFatoSaga.REPARO_FALHOU:
      case TipoFatoSaga.REPARO_INTERROMPIDO:
        await this.tratarFatoTerminalExecucao(contexto, envelope, ocorridoEm);
        break;
      case TipoFatoSaga.ESTORNO_CONCLUIDO:
      case TipoFatoSaga.PENDENCIA_RESOLVIDA:
        await this.tratarPendenciaResolvidaOuEstorno(
          contexto,
          envelope,
          bloqueada.ordem.status,
        );
        break;
      case TipoFatoSaga.PAGAMENTO_TARDIO_REGISTRADO:
        await this.abrirPendenciaFinanceira(
          contexto,
          envelope,
          envelope.payload as PagamentoConfirmadoPayload,
        );
        break;
      default:
        break;
    }
  }

  private async tratarSituacaoFinanceira(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    status: StatusOS,
    ocorridoEm: Date,
  ): Promise<void> {
    const payload = envelope.payload as SituacaoFinanceiraPayload;
    if (status === StatusOS.AGUARDANDO_PAGAMENTO) {
      if (
        payload.situacaoPagamento === SituacaoPagamentoFinanceira.PAGO_NO_PRAZO
      ) {
        await this.pedidos.marcarConcluidoPorTipo(
          contexto,
          envelope.ordemServicoId,
          envelope.rodada,
          TipoPedidoSaga.CONSULTAR_SITUACAO_FINANCEIRA,
        );
        await this.encerrarConsultaPrazoReferencia(
          contexto,
          envelope.ordemServicoId,
          envelope.rodada,
        );
        if (payload.orderId) {
          await this.registrarPagamento(contexto, envelope, {
            cobrancaId: payload.cobrancaId,
            orderId: payload.orderId,
            valorCentavos: payload.valorCentavos,
          });
        }
        const resultado = await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) => os.registrarPagamentoConfirmado(quando),
          ocorridoEm,
          observacao: 'Pagamento confirmado no prazo (consulta Billing)',
        });
        if (resultado.mudouStatus && resultado.eventId) {
          const pedidoEventId =
            await this.transicoes.registrarIniciarReparoNaOutbox(
              contexto,
              resultado.bloqueada,
              resultado.eventId,
            );
          await this.pedidos.registrar(contexto, {
            ordemServicoId: envelope.ordemServicoId,
            rodada: envelope.rodada,
            tipo: TipoPedidoSaga.INICIAR_REPARO,
            destino: DESTINO_FILA_EXECUTION,
            eventId: pedidoEventId,
          });
        }
        return;
      }
      if (
        payload.situacaoPagamento === SituacaoPagamentoFinanceira.INDETERMINADA
      ) {
        await this.pedidos.marcarConcluidoPorTipo(
          contexto,
          envelope.ordemServicoId,
          envelope.rodada,
          TipoPedidoSaga.CONSULTAR_SITUACAO_FINANCEIRA,
        );
        await this.consultaPrazo.agendarProximaReconsulta(
          contexto,
          envelope.ordemServicoId,
        );
        this.osMetrics.recordSituacaoFinanceiraIndeterminada();
        return;
      }
      if (
        payload.situacaoPagamento === SituacaoPagamentoFinanceira.SEM_PAGAMENTO
      ) {
        await this.pedidos.marcarConcluidoPorTipo(
          contexto,
          envelope.ordemServicoId,
          envelope.rodada,
          TipoPedidoSaga.CONSULTAR_SITUACAO_FINANCEIRA,
        );
        await this.encerrarConsultaPrazoReferencia(
          contexto,
          envelope.ordemServicoId,
          envelope.rodada,
        );
        const resultado = await this.transicoes.aplicar(contexto, {
          ordemServicoId: envelope.ordemServicoId,
          aplicar: (os, quando) =>
            os.registrarCompensacaoIniciada(
              'Sem pagamento confirmado após consulta',
              quando,
            ),
          ocorridoEm,
          observacao: 'Situação financeira SEM_PAGAMENTO',
        });
        if (resultado.mudouStatus && resultado.eventId) {
          await this.compensacao.avancarAposEntradaEmCancelamento(contexto, {
            ordemServicoId: envelope.ordemServicoId,
            rodada: envelope.rodada,
            causationId: resultado.eventId,
          });
        }
        return;
      }
    }
    if (status === StatusOS.EM_CANCELAMENTO) {
      await this.compensacao.tratarSituacaoFinanceiraE10(
        contexto,
        envelope.ordemServicoId,
        envelope.eventId,
        payload,
      );
    }
  }

  private async tratarFatoTerminalExecucao(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    ocorridoEm: Date,
  ): Promise<void> {
    const payload = envelope.payload as ReparoExecucaoPayload;
    const pecas =
      payload.pecasUtilizadas?.map((p) => ({
        itemId: p.itemId,
        quantidade: p.quantidade,
      })) ?? [];
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      envelope.ordemServicoId,
    );
    if (!bloqueada) {
      return;
    }
    if (
      envelope.eventType === EVENTO_REPARO_FALHOU &&
      (await this.reservas.possuiConsumoAplicadoNaRodada(
        contexto,
        envelope.ordemServicoId,
        envelope.rodada,
      ))
    ) {
      return;
    }
    const tipoFato =
      envelope.eventType === EVENTO_REPARO_FALHOU
        ? 'REPARO_FALHOU'
        : 'REPARO_INTERROMPIDO';
    const quandoFato =
      tipoFato === 'REPARO_FALHOU' && payload.falhouEm
        ? new Date(payload.falhouEm)
        : ocorridoEm;
    if (bloqueada.ordem.status !== StatusOS.EM_CANCELAMENTO) {
      const motivoCompensacao =
        tipoFato === 'REPARO_FALHOU'
          ? 'Falha do reparo'
          : 'Interrupção do reparo';
      await this.transicoes.aplicar(contexto, {
        ordemServicoId: envelope.ordemServicoId,
        aplicar: (os, quando) =>
          os.registrarCompensacaoIniciada(motivoCompensacao, quando),
        ocorridoEm: quandoFato,
        observacao:
          tipoFato === 'REPARO_FALHOU'
            ? 'Compensação por falha do reparo'
            : 'Compensação por interrupção do reparo',
      });
    }
    await this.aplicarConsumoEfetivo(
      contexto,
      envelope,
      payload,
      tipoFato,
      quandoFato,
    );
    await this.compensacao.registrarFatoTerminalExecucao(
      contexto,
      envelope.ordemServicoId,
      pecas,
    );
  }

  private async tratarPendenciaResolvidaOuEstorno(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    status: StatusOS,
  ): Promise<void> {
    const payload = envelope.payload as {
      pendenciaId?: string;
      cobrancaId?: string;
    };
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const abertas = await cliente.pendenciaOs.findMany({
      where: {
        ordemServicoId: envelope.ordemServicoId,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
      },
    });
    const alvo = abertas.find((pendencia) => {
      const detalhes = pendencia.detalhes as Record<string, unknown>;
      if (payload.pendenciaId) {
        return detalhes.pendenciaId === payload.pendenciaId;
      }
      if (payload.cobrancaId) {
        return detalhes.cobrancaId === payload.cobrancaId;
      }
      return false;
    });
    if (!alvo) {
      return;
    }
    await cliente.pendenciaOs.update({
      where: { id: alvo.id },
      data: { resolvida: true, resolvidaEm: new Date() },
    });
    if (status === StatusOS.EM_CANCELAMENTO) {
      await this.compensacao.avancarSeEmCancelamento(
        contexto,
        envelope.ordemServicoId,
        envelope.eventId,
      );
    }
  }

  private async registrarPagamento(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    payload: PagamentoConfirmadoPayload,
  ): Promise<void> {
    if (!payload.orderId) {
      return;
    }
    await this.projecao.registrarPagamento(contexto, {
      ordemServicoId: envelope.ordemServicoId,
      rodada: envelope.rodada,
      cobrancaId: payload.cobrancaId ?? null,
      orderId: payload.orderId,
      valorCentavos: payload.valorCentavos ?? null,
      eventId: envelope.eventId,
    });
  }

  private async tratarCobrancaCriada(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    bloqueada: NonNullable<
      Awaited<ReturnType<OrdemServicoGateway['bloquearParaAtualizacao']>>
    >,
  ): Promise<void> {
    const payload = envelope.payload as {
      cobrancaId?: string;
      orderId?: string;
      linkPagamento?: string;
      valorCentavos?: number;
      prazoPagamento?: string;
    };
    if (!payload.orderId) {
      return;
    }
    const criado = await this.projecao.registrarPagamento(contexto, {
      ordemServicoId: envelope.ordemServicoId,
      rodada: envelope.rodada,
      cobrancaId: payload.cobrancaId ?? null,
      orderId: payload.orderId,
      valorCentavos: payload.valorCentavos ?? null,
      linkPagamento: payload.linkPagamento ?? null,
      eventId: envelope.eventId,
    });
    if (!payload.linkPagamento) {
      return;
    }
    if (
      criado === 'duplicado' &&
      (await this.projecao.jaNotificouPagamentoDisponivel(
        contexto,
        envelope.ordemServicoId,
        envelope.rodada,
        payload.orderId,
      ))
    ) {
      return;
    }
    const eventId = randomUUID();
    await this.outbox.registrar(contexto, {
      eventId,
      eventType: EVENTO_PAGAMENTO_DISPONIVEL,
      envelope: {
        eventId,
        eventType: EVENTO_PAGAMENTO_DISPONIVEL,
        version: 1,
        occurredAt: envelope.occurredAt,
        source: 'os-service',
        correlationId: bloqueada.ordem.correlationId,
        causationId: envelope.eventId,
        ordemServicoId: envelope.ordemServicoId,
        rodada: envelope.rodada,
        payload: {
          destinatario: {
            nome: bloqueada.cliente.nome,
            email: bloqueada.cliente.email,
          },
          numeroOs: bloqueada.ordem.numero,
          linkPagamento: payload.linkPagamento,
          prazoPagamento: payload.prazoPagamento,
          valorCentavos: payload.valorCentavos,
        },
      },
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_TOPICO_NOTIFICACAO,
    });
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.projecaoFinanceiraOs.updateMany({
      where: {
        ordemServicoId: envelope.ordemServicoId,
        rodada: envelope.rodada,
        orderId: payload.orderId,
        natureza: 'PAGAMENTO',
      },
      data: { linkPagamento: payload.linkPagamento },
    });
  }

  private async encerrarConsultaPrazoReferencia(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const abertas = await cliente.pendenciaOs.findMany({
      where: {
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
      },
    });
    const agora = new Date();
    for (const pendencia of abertas) {
      const detalhes = pendencia.detalhes as Record<string, unknown>;
      if (detalhes.natureza === 'CONSULTA_PRAZO_REFERENCIA') {
        await cliente.pendenciaOs.update({
          where: { id: pendencia.id },
          data: { resolvida: true, resolvidaEm: agora },
        });
      }
    }
    const snapshot = await this.estadoCompensacao.obterOuCriar(
      contexto,
      ordemServicoId,
      rodada,
    );
    snapshot.consultaIdVigente = null;
    await this.estadoCompensacao.salvar(contexto, snapshot);
  }

  private async abrirPendenciaFinanceira(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    payload: PagamentoConfirmadoPayload,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const duplicada = await cliente.pendenciaOs.findFirst({
      where: {
        ordemServicoId: envelope.ordemServicoId,
        rodada: envelope.rodada,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
        detalhes: {
          path: ['orderId'],
          equals: payload.orderId,
        },
      },
    });
    if (duplicada) {
      return;
    }
    await cliente.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: envelope.ordemServicoId,
        rodada: envelope.rodada,
        tipo: TipoPendenciaOs.FINANCEIRA,
        detalhes: {
          orderId: payload.orderId,
          eventId: envelope.eventId,
          motivo: 'Segundo pagamento após encerramento',
        },
      },
    });
  }

  private async aplicarConsumoEfetivo(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    payload: ReparoExecucaoPayload,
    tipoFato: 'REPARO_CONCLUIDO' | 'REPARO_FALHOU' | 'REPARO_INTERROMPIDO',
    ocorridoEm: Date,
  ): Promise<{ impedimentoInventario: boolean; reutilizado: boolean }> {
    const pecas =
      payload.pecasUtilizadas?.map((p) => ({
        pecaId: p.itemId,
        quantidade: p.quantidade,
      })) ?? [];
    const divergenciasFato =
      payload.divergencias?.map((d) => ({
        pecaId: d.itemId,
        itemId: d.itemId,
        quantidadePrevista: d.quantidadePrevista ?? 0,
        quantidadeUtilizada: d.quantidadeUtilizada ?? 0,
        quantidadeReservada: d.quantidadePrevista ?? 0,
        quantidadeInformada: d.quantidadeUtilizada ?? 0,
        tipo: d.tipo ?? null,
        observacao: d.observacao ?? null,
        justificativa: d.justificativa ?? null,
        motivo: d.observacao ?? '',
      })) ?? [];
    const concluidoEm = payload.concluidoEm
      ? new Date(payload.concluidoEm)
      : null;
    const idempotencyKey = `estoque.consumir:${envelope.eventId}`;

    try {
      const consumo = await this.consumirReserva.execute(
        {
          ordemServicoId: envelope.ordemServicoId,
          rodada: envelope.rodada,
          itensUtilizados: pecas,
          idempotencyKey,
          contextoFato: {
            eventId: envelope.eventId,
            fatoOcorridoEm: ocorridoEm,
            concluidoEm,
            responsavelId: payload.responsavelId ?? null,
            tipoFato,
            divergenciasFato,
            consumoEfetivo: payload.pecasUtilizadas ?? [],
            aguardandoFinalizacao: tipoFato === 'REPARO_CONCLUIDO',
          },
        },
        contexto,
      );
      return {
        impedimentoInventario: consumo.impedimentoInventario,
        reutilizado: consumo.reutilizado,
      };
    } catch (erro) {
      if (erro instanceof ReservaJaProcessadaError) {
        const consumoJaAplicado =
          (await this.reservas.possuiConsumoAplicadoNaRodada(
            contexto,
            envelope.ordemServicoId,
            envelope.rodada,
          )) ||
          (await this.reservas.possuiConsumoAplicado(
            contexto,
            envelope.ordemServicoId,
            envelope.rodada,
            pecas.map((p) => p.pecaId),
          ));
        if (!consumoJaAplicado) {
          throw erro;
        }
        return { impedimentoInventario: false, reutilizado: true };
      }
      throw erro;
    }
  }

  private async tratarReparoConcluido(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    ocorridoEm: Date,
  ): Promise<void> {
    const payload = envelope.payload as ReparoConcluidoPayload;
    const { impedimentoInventario } = await this.aplicarConsumoEfetivo(
      contexto,
      envelope,
      payload,
      'REPARO_CONCLUIDO',
      ocorridoEm,
    );

    if (impedimentoInventario) {
      return;
    }

    await this.transicoes.aplicar(contexto, {
      ordemServicoId: envelope.ordemServicoId,
      aplicar: (os, quando) => {
        if (os.status === StatusOS.AGUARDANDO_EXECUCAO) {
          os.registrarReparoIniciado(quando);
        }
        os.registrarReparoConcluido(quando);
      },
      ocorridoEm: payload.concluidoEm
        ? new Date(payload.concluidoEm)
        : ocorridoEm,
      observacao: 'Reparo concluído',
    });
  }
}
