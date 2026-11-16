import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/shared/database/prisma.service';
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

@Injectable()
export class PublicadorOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublicadorOutboxService.name);
  private intervalo?: NodeJS.Timeout;
  private readonly habilitado: boolean;
  private readonly intervaloMs: number;
  private readonly posseMs: number;
  private readonly loteMaximo: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(FILA_MENSAGENS)
    private readonly fila: FilaMensagensGateway,
    @Inject(PUBLICACAO_NOTIFICACAO)
    private readonly notificacao: PublicacaoNotificacaoGateway,
  ) {
    this.habilitado =
      this.config.get<string>('OUTBOX_PUBLISHER_HABILITADO') === 'true';
    this.intervaloMs = Number(
      this.config.get<string>('OUTBOX_PUBLISHER_INTERVAL_MS') ?? '2000',
    );
    this.posseMs = Number(
      this.config.get<string>('OUTBOX_REIVINDICACAO_MS') ?? '30000',
    );
    this.loteMaximo = Number(
      this.config.get<string>('OUTBOX_PUBLISHER_LOTE') ?? '10',
    );
  }

  onModuleInit(): void {
    if (!this.habilitado) return;

    this.intervalo = setInterval(() => {
      void this.publicarLote().catch((erro) =>
        this.logger.error('Falha ao publicar outbox', erro),
      );
    }, this.intervaloMs);
  }

  onModuleDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  async publicarLote(): Promise<void> {
    const mensagens = await this.reivindicarLote();
    for (const mensagem of mensagens) {
      await this.publicarMensagemReivindicada(mensagem);
    }
  }

  async reivindicarLote(): Promise<
    {
      id: string;
      destino: string;
      envelope: unknown;
      correlationId: string;
      eventId: string;
      tokenReivindicacao: string | null;
    }[]
  > {
    const agora = new Date();
    const bloqueadoAte = new Date(agora.getTime() + this.posseMs);
    const tokenReivindicacao = randomUUID();

    return this.prisma.$transaction(async (tx) => {
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
  }): Promise<void> {
    const token = mensagem.tokenReivindicacao;
    if (!token) return;

    try {
      await this.enviarParaDestino(mensagem.destino, mensagem);
      const confirmado = await this.prisma.outboxMensagem.updateMany({
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
      });
      if (confirmado.count === 0) {
        this.logger.warn(
          `Fencing: confirmação de envio ignorada para outbox ${mensagem.id}`,
        );
      }
    } catch (erro) {
      this.logger.warn(
        `Falha ao publicar evento ${mensagem.eventId}`,
        erro instanceof Error ? erro.message : erro,
      );
      await this.prisma.outboxMensagem.updateMany({
        where: { id: mensagem.id, tokenReivindicacao: token },
        data: {
          tentativas: { increment: 1 },
          bloqueadoAte: null,
          tokenReivindicacao: null,
        },
      });
    }
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
