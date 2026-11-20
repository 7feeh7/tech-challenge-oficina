import { randomUUID } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { enrichObservabilityContext } from '@/shared/http/correlation-id.context';
import type { OutboxGateway } from '@/shared/messaging/application/ports/outbox.gateway';
import {
  COMANDO_GERAR_ORCAMENTO,
  COMANDO_INICIAR_DIAGNOSTICO,
  COMANDO_INICIAR_REPARO,
  DESTINO_FILA_BILLING,
  DESTINO_FILA_EXECUTION,
  DESTINO_TOPICO_NOTIFICACAO,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import {
  OrdemServico,
  SugestaoItemOrdem,
} from '../../domain/entities/ordem-servico.entity';
import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import { STATUS_CHANGED_EVENT_TYPE } from '../events/status-changed.event';
import {
  OrdemServicoBloqueada,
  OrdemServicoGateway,
  RegistroDeStatus,
} from '../ports/ordem-servico.gateway';

const ORIGEM_OS = 'os-service';

export interface AplicarMudancaInput {
  ordemServicoId: string;
  aplicar: (ordem: OrdemServico, ocorridoEm: Date) => void;
  observacao?: string;
  motivo?: string | null;
  ocorridoEm?: Date;
  publicarStatus?: boolean;
}

export interface AplicarTransicaoOrdemInput {
  observacao?: string;
  motivo?: string | null;
  ocorridoEm?: Date;
  publicarStatus?: boolean;
}

export interface ResultadoTransicaoOrdem {
  bloqueada: OrdemServicoBloqueada;
  statusAnterior: StatusOS;
  statusNovo: StatusOS;
  mudouStatus: boolean;
  eventId?: string;
}

export class TransicaoOrdemServicoService {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly outbox: OutboxGateway,
    private readonly metricas: OsMetricsService,
  ) {}

  async abrir(
    contexto: ContextoTransacao,
    ordem: OrdemServico,
  ): Promise<OrdemServicoBloqueada> {
    const eventId = randomUUID();
    const ocorridoEm = new Date();
    const registro: RegistroDeStatus = {
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
      rodada: ordem.rodadaVigente,
      eventId,
      ocorridoEm,
      observacao: 'Ordem aberta',
    };

    const bloqueada = await this.ordens.criar(contexto, ordem, registro);

    enrichObservabilityContext({
      correlationId: bloqueada.ordem.correlationId,
      ordemServicoId: bloqueada.ordem.id,
      rodada: bloqueada.ordem.rodadaVigente,
    });

    await this.registrarStatusChangedNaOutbox(
      contexto,
      bloqueada,
      null,
      StatusOS.RECEBIDA,
      eventId,
      ocorridoEm,
      null,
    );
    await this.registrarIniciarDiagnosticoNaOutbox(
      contexto,
      bloqueada,
      eventId,
    );

    return bloqueada;
  }

  async aplicar(
    contexto: ContextoTransacao,
    input: AplicarMudancaInput,
  ): Promise<ResultadoTransicaoOrdem> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      input.ordemServicoId,
    );
    if (!bloqueada) {
      throw new OrdemServicoNaoEncontradaError(input.ordemServicoId);
    }

    enrichObservabilityContext({
      correlationId: bloqueada.ordem.correlationId,
      ordemServicoId: input.ordemServicoId,
      rodada: bloqueada.ordem.rodadaVigente,
    });

    const statusAnterior = bloqueada.ordem.status;
    const rodadaAnterior = bloqueada.ordem.rodadaVigente;
    const ocorridoEm = input.ocorridoEm ?? new Date();
    input.aplicar(bloqueada.ordem, ocorridoEm);
    const statusNovo = bloqueada.ordem.status;
    const mudouStatus = statusAnterior !== statusNovo;

    let registro: RegistroDeStatus | undefined;
    let eventId: string | undefined;

    if (mudouStatus) {
      eventId = randomUUID();
      registro = {
        statusAnterior,
        statusNovo,
        rodada: bloqueada.ordem.rodadaVigente,
        eventId,
        ocorridoEm,
        motivo: input.motivo ?? null,
        observacao: input.observacao,
      };
    }

    await this.ordens.salvar(contexto, bloqueada.ordem, registro);

    if (mudouStatus && input.publicarStatus !== false && eventId) {
      await this.registrarStatusChangedNaOutbox(
        contexto,
        bloqueada,
        statusAnterior,
        statusNovo,
        eventId,
        ocorridoEm,
        null,
      );
    }

    // Recusa do orçamento abre nova rodada: o mecânico refaz o diagnóstico
    // partindo dos itens oficiais da rodada anterior (D1.7, D1.18).
    if (eventId && bloqueada.ordem.rodadaVigente > rodadaAnterior) {
      await this.registrarIniciarDiagnosticoNaOutbox(
        contexto,
        bloqueada,
        eventId,
      );
    }

    return {
      bloqueada,
      statusAnterior,
      statusNovo,
      mudouStatus,
      eventId,
    };
  }

  async aplicarSobBloqueio(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    aplicar: (ordem: OrdemServico) => void,
    opcoes?: AplicarTransicaoOrdemInput,
  ): Promise<ResultadoTransicaoOrdem> {
    return await this.aplicar(contexto, {
      ordemServicoId,
      aplicar: (ordem, ocorridoEm) => {
        void ocorridoEm;
        aplicar(ordem);
      },
      ...opcoes,
    });
  }

  /** Persiste alterações sem mudança de status (PATCH, devolução física idempotente). */
  async salvarSobBloqueio(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    aplicar: (ordem: OrdemServico) => void,
  ): Promise<OrdemServicoBloqueada> {
    const resultado = await this.aplicar(contexto, {
      ordemServicoId,
      aplicar: (ordem, ocorridoEm) => {
        void ocorridoEm;
        aplicar(ordem);
      },
      publicarStatus: false,
    });
    return resultado.bloqueada;
  }

  registrarMetricasDaAbertura(): void {
    this.metricas.recordOsCriada();
  }

  async registrarMetricasDaMudanca(
    resultado: ResultadoTransicaoOrdem,
  ): Promise<void> {
    if (!resultado.mudouStatus) {
      return;
    }
    await this.metricas.recordTransicao(
      resultado.bloqueada.ordem.id!,
      resultado.statusAnterior,
      new Date(),
    );
  }

  async registrarStatusChangedNaOutbox(
    contexto: ContextoTransacao,
    bloqueada: OrdemServicoBloqueada,
    statusAnterior: StatusOS | null,
    statusNovo: StatusOS,
    eventId: string,
    ocorridoEm: Date,
    causationId: string | null,
  ): Promise<void> {
    const envelope: EnvelopeMensagem = {
      eventId,
      eventType: STATUS_CHANGED_EVENT_TYPE,
      version: 1,
      occurredAt: ocorridoEm.toISOString(),
      source: ORIGEM_OS,
      correlationId: bloqueada.ordem.correlationId,
      causationId,
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      payload: {
        numeroOS: bloqueada.ordem.numero,
        statusAnterior,
        statusNovo,
        destinatario: {
          nome: bloqueada.cliente.nome,
          email: bloqueada.cliente.email,
        },
      },
    };

    await this.outbox.registrar(contexto, {
      eventId,
      eventType: STATUS_CHANGED_EVENT_TYPE,
      envelope,
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_TOPICO_NOTIFICACAO,
    });
  }

  async registrarIniciarDiagnosticoNaOutbox(
    contexto: ContextoTransacao,
    bloqueada: OrdemServicoBloqueada,
    causationId: string,
  ): Promise<void> {
    const eventId = randomUUID();
    const envelope: EnvelopeMensagem = {
      eventId,
      eventType: COMANDO_INICIAR_DIAGNOSTICO,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: ORIGEM_OS,
      correlationId: bloqueada.ordem.correlationId,
      causationId,
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      payload: {
        veiculo: {
          placa: bloqueada.veiculo.placa,
          modelo: bloqueada.veiculo.modelo,
        },
        descricaoProblema: bloqueada.ordem.descricaoProblema,
        sugestoes: this.sugestoesDaRodada(bloqueada.ordem),
      },
    };

    await this.outbox.registrar(contexto, {
      eventId,
      eventType: COMANDO_INICIAR_DIAGNOSTICO,
      envelope,
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_FILA_EXECUTION,
    });
  }

  async registrarIniciarReparoNaOutbox(
    contexto: ContextoTransacao,
    bloqueada: OrdemServicoBloqueada,
    causationId: string,
  ): Promise<string> {
    const eventId = randomUUID();
    const ocorridoEm = new Date();
    const envelope: EnvelopeMensagem = {
      eventId,
      eventType: COMANDO_INICIAR_REPARO,
      version: 1,
      occurredAt: ocorridoEm.toISOString(),
      source: ORIGEM_OS,
      correlationId: bloqueada.ordem.correlationId,
      causationId,
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      payload: {
        itensOficiais: [
          ...bloqueada.ordem.servicos.map((s) => ({
            tipo: 'SERVICO' as const,
            itemId: s.servicoId,
            nome: s.servicoId,
            quantidade: s.quantidade,
          })),
          ...bloqueada.ordem.pecas.map((p) => ({
            tipo: 'PECA' as const,
            itemId: p.pecaId,
            nome: p.pecaId,
            quantidade: p.quantidade,
          })),
        ],
      },
    };

    await this.outbox.registrar(contexto, {
      eventId,
      eventType: COMANDO_INICIAR_REPARO,
      envelope,
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_FILA_EXECUTION,
    });
    return eventId;
  }

  async registrarGerarOrcamentoNaOutbox(
    contexto: ContextoTransacao,
    bloqueada: OrdemServicoBloqueada,
    causationId: string | null,
    itens: {
      tipo: 'PECA' | 'SERVICO';
      itemId: string;
      nome: string;
      quantidade: number;
      precoUnitarioCentavos: number;
    }[],
  ): Promise<void> {
    const eventId = randomUUID();
    const ocorridoEm = new Date();
    const envelope: EnvelopeMensagem = {
      eventId,
      eventType: COMANDO_GERAR_ORCAMENTO,
      version: 1,
      occurredAt: ocorridoEm.toISOString(),
      source: ORIGEM_OS,
      correlationId: bloqueada.ordem.correlationId,
      causationId,
      ordemServicoId: bloqueada.ordem.id!,
      rodada: bloqueada.ordem.rodadaVigente,
      payload: {
        clienteId: bloqueada.ordem.clienteId,
        itens,
      },
    };

    await this.outbox.registrar(contexto, {
      eventId,
      eventType: COMANDO_GERAR_ORCAMENTO,
      envelope,
      correlationId: bloqueada.ordem.correlationId,
      destino: DESTINO_FILA_BILLING,
    });
  }

  private sugestoesDaRodada(ordem: OrdemServico): SugestaoItemOrdem[] {
    if (ordem.rodadaVigente === 1) {
      return ordem.sugestoes.map(({ tipo, itemId, quantidade }) => ({
        tipo,
        itemId,
        quantidade,
      }));
    }
    return [
      ...ordem.servicos.map((item) => ({
        tipo: 'SERVICO' as const,
        itemId: item.servicoId,
        quantidade: item.quantidade,
      })),
      ...ordem.pecas.map((item) => ({
        tipo: 'PECA' as const,
        itemId: item.pecaId,
        quantidade: item.quantidade,
      })),
    ];
  }
}
