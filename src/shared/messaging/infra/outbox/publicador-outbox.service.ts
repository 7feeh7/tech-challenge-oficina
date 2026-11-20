import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@/shared/generated/prisma/client';
import { executarTransacaoComLimite } from '@/shared/database/executar-transacao-com-limite';
import { PrismaService } from '@/shared/database/prisma.service';
import { correlationIdStorage } from '@/shared/http/correlation-id.context';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { MessagingMetricsService } from '@/shared/observability/messaging-metrics.service';
import { tagActiveSpanWithCorrelation } from '@/shared/observability/trace-context';
import { calcularBloqueadoAteRetentativaOutbox } from '../../application/calcular-espera-retentativa-outbox';
import type { PublicacaoNotificacaoGateway } from '../../application/ports/publicacao-notificacao.gateway';
import type { FilaMensagensGateway } from '../../application/ports/fila-mensagens.gateway';
import {
  FILA_MENSAGENS,
  PUBLICACAO_NOTIFICACAO,
} from '../../application/ports/tokens';
import {
  DESTINO_FILA_BILLING,
  DESTINO_FILA_EXECUTION,
  DESTINO_TOPICO_NOTIFICACAO,
  type EnvelopeMensagem,
} from '../../envelope';
import { AgendadorCicloProcessador } from '../agendador-ciclo-processador';

@Injectable()
export class PublicadorOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublicadorOutboxService.name);
  private agendador?: AgendadorCicloProcessador;
  private readonly habilitado: boolean;
  private readonly intervaloMs: number;
  private readonly posseMs: number;
  private readonly persistenciaMs: number;
  private readonly loteMaximo: number;
  private readonly retentativaBaseMs: number;
  private readonly retentativaTetoMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(FILA_MENSAGENS)
    private readonly fila: FilaMensagensGateway,
    @Inject(PUBLICACAO_NOTIFICACAO)
    private readonly notificacao: PublicacaoNotificacaoGateway,
    private readonly jsonLogger: JsonLoggerService,
    private readonly mensageriaMetrics: MessagingMetricsService,
  ) {
    this.habilitado =
      this.config.get<string>('OUTBOX_PUBLISHER_HABILITADO') === 'true';
    this.intervaloMs = Number(
      this.config.get<string>('OUTBOX_PUBLISHER_INTERVAL_MS') ?? '2000',
    );
    this.posseMs = Number(
      this.config.get<string>('OUTBOX_REIVINDICACAO_MS') ?? '450000',
    );
    this.persistenciaMs = Number(
      this.config.get<string>('OUTBOX_PERSISTENCIA_MS') ?? '5000',
    );
    this.loteMaximo = Number(
      this.config.get<string>('OUTBOX_PUBLISHER_LOTE') ?? '5',
    );
    this.retentativaBaseMs = Number(
      this.config.get<string>('OUTBOX_RETRY_BASE_MS') ?? '1000',
    );
    this.retentativaTetoMs = Number(
      this.config.get<string>('OUTBOX_RETRY_TETO_MS') ?? '300000',
    );
  }

  onModuleInit(): void {
    if (!this.habilitado) return;

    this.agendador = new AgendadorCicloProcessador(
      this.intervaloMs,
      () => this.publicarLote(),
      this.logger,
      'Falha ao publicar outbox',
    );
    this.agendador.iniciar();
  }

  async onModuleDestroy(): Promise<void> {
    await this.agendador?.parar();
  }

  async publicarLote(): Promise<void> {
    const mensagens = await this.reivindicarLote();
    for (const mensagem of mensagens) {
      await this.publicarMensagemReivindicada(mensagem);
    }
    await this.mensageriaMetrics.recordOutboxBacklog(this.persistenciaMs);
  }

  async reivindicarLote(): Promise<
    {
      id: string;
      destino: string;
      envelope: unknown;
      correlationId: string;
      eventId: string;
      tokenReivindicacao: string | null;
      tentativas: number;
    }[]
  > {
    const agora = new Date();
    const bloqueadoAte = new Date(agora.getTime() + this.posseMs);
    const tokenReivindicacao = randomUUID();

    return this.executarNoBanco(async (tx) => {
      const pendentes = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM outbox_mensagens
        WHERE enviado_em IS NULL
          AND (bloqueado_ate IS NULL OR bloqueado_ate < ${agora})
        ORDER BY criado_em
        LIMIT ${this.loteMaximo}
        FOR UPDATE SKIP LOCKED`;

      if (pendentes.length === 0) return [];

      const ids = pendentes.map((p) => p.id);
      await tx.outboxMensagem.updateMany({
        where: { id: { in: ids } },
        data: { bloqueadoAte, tokenReivindicacao },
      });

      return tx.outboxMensagem.findMany({ where: { id: { in: ids } } });
    });
  }

  async publicarMensagemReivindicada(mensagem: {
    id: string;
    destino: string;
    envelope: unknown;
    correlationId: string;
    eventId: string;
    tokenReivindicacao: string | null;
    tentativas?: number;
  }): Promise<void> {
    const token = mensagem.tokenReivindicacao;
    if (!token) return;

    try {
      await correlationIdStorage.run(
        {
          correlationId: mensagem.correlationId,
          requestId: randomUUID(),
          eventId: mensagem.eventId,
        },
        async () => {
          tagActiveSpanWithCorrelation(mensagem.correlationId);
          await this.enviarParaDestino(mensagem.destino, mensagem);
        },
      );
      const confirmado = await this.executarNoBanco((tx) =>
        tx.outboxMensagem.updateMany({
          where: {
            id: mensagem.id,
            tokenReivindicacao: token,
            enviadoEm: null,
          },
          data: {
            enviadoEm: new Date(),
            bloqueadoAte: null,
            tokenReivindicacao: null,
          },
        }),
      );
      if (confirmado.count === 0) {
        correlationIdStorage.run(
          {
            correlationId: mensagem.correlationId,
            requestId: randomUUID(),
            eventId: mensagem.eventId,
          },
          () => {
            tagActiveSpanWithCorrelation(mensagem.correlationId);
            this.jsonLogger.logWithMeta(
              'warn',
              'outbox.publicacao.fencing',
              { outboxId: mensagem.id },
              'OutboxPublicador',
            );
          },
        );
      }
    } catch (erro) {
      this.mensageriaMetrics.recordPublicacaoFalha();
      correlationIdStorage.run(
        {
          correlationId: mensagem.correlationId,
          requestId: randomUUID(),
          eventId: mensagem.eventId,
        },
        () => {
          tagActiveSpanWithCorrelation(mensagem.correlationId);
          this.jsonLogger.logWithMeta(
            'warn',
            'outbox.publicacao.falha',
            {
              eventId: mensagem.eventId,
              error: erro instanceof Error ? erro.message : 'erro desconhecido',
            },
            'OutboxPublicador',
          );
        },
      );
      const tentativasAtuais = mensagem.tentativas ?? 0;
      const novasTentativas = tentativasAtuais + 1;
      const bloqueadoAte = calcularBloqueadoAteRetentativaOutbox(
        novasTentativas,
        this.retentativaBaseMs,
        this.retentativaTetoMs,
      );
      await this.executarNoBanco((tx) =>
        tx.outboxMensagem.updateMany({
          where: { id: mensagem.id, tokenReivindicacao: token },
          data: {
            tentativas: { increment: 1 },
            bloqueadoAte,
            tokenReivindicacao: null,
          },
        }),
      );
    }
  }

  // Toda gravação do publicador no banco tem limite de execução: ele entra no pior
  // caso do ciclo e da posse (docs/tempos-processadores-os.md).
  private executarNoBanco<T>(
    trabalho: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return executarTransacaoComLimite(
      this.prisma,
      this.persistenciaMs,
      trabalho,
    );
  }

  private async enviarParaDestino(
    destino: string,
    mensagem: {
      envelope: unknown;
      correlationId: string;
    },
  ): Promise<void> {
    const envelope = mensagem.envelope as EnvelopeMensagem;
    if (destino === DESTINO_TOPICO_NOTIFICACAO) {
      await this.notificacao.publicar(envelope, mensagem.correlationId);
      return;
    }

    const filaUrl = this.resolverUrlFila(destino);
    await this.fila.enviar(filaUrl, envelope, mensagem.correlationId);
  }

  private resolverUrlFila(destino: string): string {
    if (destino === DESTINO_FILA_BILLING) {
      return this.config.getOrThrow<string>('SQS_BILLING_IN_URL');
    }
    if (destino === DESTINO_FILA_EXECUTION) {
      return this.config.getOrThrow<string>('SQS_EXECUTION_IN_URL');
    }
    throw new Error(`Destino de outbox desconhecido: ${destino}`);
  }
}
