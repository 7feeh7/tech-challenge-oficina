import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classificarErroConsumo } from '../../classificar-erro-consumo';
import { EnvelopeMensagemInvalidoError } from '../../validar-envelope';
import type { FilaMensagensGateway } from '../../application/ports/fila-mensagens.gateway';
import { FILA_MENSAGENS } from '../../application/ports/tokens';
import { ProcessarMensagemEntradaService } from '../../application/services/processar-mensagem-entrada.service';
import { MessagingMetricsService } from '@/shared/observability/messaging-metrics.service';
import { registrarFalhaTransicaoSeAplicavel } from '@/shared/observability/registrar-falha-transicao';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import { AgendadorCicloProcessador } from '../agendador-ciclo-processador';

@Injectable()
export class ConsumidorFilaOsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsumidorFilaOsService.name);
  private agendador?: AgendadorCicloProcessador;
  private readonly sinalAbortamento = new AbortController();
  private readonly habilitado: boolean;
  private readonly filaUrl?: string;
  private readonly dlqUrl?: string;
  private readonly intervaloMs: number;
  private readonly loteMaximo: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(FILA_MENSAGENS)
    private readonly fila: FilaMensagensGateway,
    private readonly processar: ProcessarMensagemEntradaService,
    private readonly mensageriaMetrics: MessagingMetricsService,
    private readonly osMetrics: OsMetricsService,
  ) {
    this.filaUrl = config.get<string>('SQS_OS_IN_URL');
    this.dlqUrl = config.get<string>('SQS_OS_IN_DLQ_URL');
    this.habilitado =
      config.get<string>('SQS_CONSUMER_HABILITADO') === 'true' &&
      !!this.filaUrl;
    this.intervaloMs = Number(
      config.get<string>('SQS_CONSUMER_INTERVAL_MS') ?? '1000',
    );
    this.loteMaximo = Number(config.get<string>('SQS_CONSUMER_LOTE') ?? '3');
  }

  onModuleInit(): void {
    if (!this.habilitado || !this.filaUrl) return;

    this.agendador = new AgendadorCicloProcessador(
      this.intervaloMs,
      () => this.poller(),
      this.logger,
      'Falha no consumidor SQS',
    );
    this.agendador.iniciar();
  }

  async onModuleDestroy(): Promise<void> {
    this.sinalAbortamento.abort();
    await this.agendador?.parar();
  }

  async poller(): Promise<void> {
    if (!this.filaUrl) return;

    let mensagens: Awaited<ReturnType<FilaMensagensGateway['receber']>>;
    try {
      mensagens = await this.fila.receber(this.filaUrl, this.loteMaximo, {
        sinalAbortamento: this.sinalAbortamento.signal,
      });
    } catch (erro) {
      if (this.sinalAbortamento.signal.aborted) {
        return;
      }
      throw erro;
    }

    for (const mensagem of mensagens) {
      try {
        await this.processarUma(mensagem.corpo, mensagem.receiptHandle);
      } catch (erro) {
        this.logger.error(
          'Falha ao processar mensagem do lote; prosseguindo com as demais',
          erro instanceof Error ? erro.message : erro,
        );
      }
    }
  }

  async processarUma(corpo: string, receiptHandle: string): Promise<void> {
    if (!this.filaUrl) return;

    try {
      await this.processar.executar(corpo);
      await this.fila.confirmar(this.filaUrl, receiptHandle);
    } catch (erro) {
      registrarFalhaTransicaoSeAplicavel(erro, this.osMetrics);
      const classificacao = classificarErroConsumo(erro);
      const mensagemErro =
        erro instanceof Error ? erro.message : 'erro desconhecido';
      this.mensageriaMetrics.recordErroConsumo(classificacao);

      if (classificacao === 'permanente') {
        this.logger.warn(
          `Erro permanente no consumo; encaminhando à DLQ: ${mensagemErro}`,
        );
        try {
          await this.encaminharDlq(corpo);
          await this.fila.confirmar(this.filaUrl, receiptHandle);
        } catch (falhaDlq) {
          this.logger.error(
            'Falha ao encaminhar à DLQ; mensagem original não confirmada',
            falhaDlq instanceof Error ? falhaDlq.message : falhaDlq,
          );
        }
        return;
      }

      this.logger.warn(
        'Mensagem não confirmada; nova tentativa pela visibilidade SQS',
        mensagemErro,
      );
    }
  }

  private async encaminharDlq(corpo: string): Promise<void> {
    if (!this.dlqUrl) {
      this.logger.error(
        'SQS_OS_IN_DLQ_URL não configurada; mensagem permanente não pode ir à DLQ.',
      );
      throw new EnvelopeMensagemInvalidoError(
        'DLQ do OS não configurada para erro permanente.',
      );
    }

    let correlationId: string = randomUUID();
    try {
      const parsed = JSON.parse(corpo) as { correlationId?: string };
      if (parsed.correlationId) correlationId = String(parsed.correlationId);
    } catch {
      /* corpo inválido: correlationId sintético */
    }

    await this.fila.enviarCorpoBruto(this.dlqUrl, corpo, correlationId);
  }
}
