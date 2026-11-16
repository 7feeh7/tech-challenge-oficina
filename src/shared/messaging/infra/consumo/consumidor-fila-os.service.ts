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

@Injectable()
export class ConsumidorFilaOsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsumidorFilaOsService.name);
  private intervalo?: NodeJS.Timeout;
  private readonly habilitado: boolean;
  private readonly filaUrl?: string;
  private readonly dlqUrl?: string;
  private readonly intervaloMs: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(FILA_MENSAGENS)
    private readonly fila: FilaMensagensGateway,
    private readonly processar: ProcessarMensagemEntradaService,
  ) {
    this.filaUrl = config.get<string>('SQS_OS_IN_URL');
    this.dlqUrl = config.get<string>('SQS_OS_IN_DLQ_URL');
    this.habilitado =
      config.get<string>('SQS_CONSUMER_HABILITADO') === 'true' &&
      !!this.filaUrl;
    this.intervaloMs = Number(
      config.get<string>('SQS_CONSUMER_INTERVAL_MS') ?? '1000',
    );
  }

  onModuleInit(): void {
    if (!this.habilitado || !this.filaUrl) return;

    this.intervalo = setInterval(() => {
      void this.poller().catch((erro) =>
        this.logger.error('Falha no consumidor SQS', erro),
      );
    }, this.intervaloMs);
  }

  onModuleDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  async poller(): Promise<void> {
    if (!this.filaUrl) return;

    const mensagens = await this.fila.receber(this.filaUrl, 5);
    for (const mensagem of mensagens) {
      await this.processarUma(mensagem.corpo, mensagem.receiptHandle);
    }
  }

  async processarUma(corpo: string, receiptHandle: string): Promise<void> {
    if (!this.filaUrl) return;

    try {
      await this.processar.executar(corpo);
      await this.fila.confirmar(this.filaUrl, receiptHandle);
    } catch (erro) {
      const classificacao = classificarErroConsumo(erro);
      const mensagemErro =
        erro instanceof Error ? erro.message : 'erro desconhecido';

      if (classificacao === 'permanente') {
        this.logger.warn(
          `Erro permanente no consumo; encaminhando à DLQ: ${mensagemErro}`,
        );
        await this.encaminharDlq(corpo);
        await this.fila.confirmar(this.filaUrl, receiptHandle);
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

    await this.fila.enviar(this.dlqUrl, corpo, correlationId);
  }
}
