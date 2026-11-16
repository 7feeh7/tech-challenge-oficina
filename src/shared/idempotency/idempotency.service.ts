import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { PrismaService } from '@/shared/database/prisma.service';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { devePersistirResultadoIdempotente } from './idempotencia-interna';

const TTL_HOURS = 24;

export interface StoredIdempotentResponse {
  statusCode: number;
  body: unknown;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashRequest(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex');
  }

  async findReplay(
    key: string,
    scope: string,
    requestHash: string,
  ): Promise<StoredIdempotentResponse | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        idempotencyKey_scope: {
          idempotencyKey: key,
          scope,
        },
      },
    });

    if (!record) {
      return null;
    }

    if (record.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key already used with a different request body.',
      );
    }

    return {
      statusCode: record.responseStatus,
      body: record.responseBody,
    };
  }

  async store(
    key: string,
    scope: string,
    requestHash: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    const expiraEm = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    await this.prisma.idempotencyRecord.create({
      data: {
        idempotencyKey: key,
        scope,
        requestHash,
        responseStatus: statusCode,
        responseBody: body as object,
        expiraEm,
      },
    });
  }

  /**
   * Idempotência das rotas internas: grava na mesma transação do efeito e só para 2xx.
   * A E28 chama este método a partir dos casos de uso.
   */
  async gravarNaTransacao(
    contexto: ContextoTransacao,
    key: string,
    scope: string,
    requestHash: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    if (!devePersistirResultadoIdempotente(statusCode)) {
      return;
    }

    const cliente =
      contexto instanceof PrismaContextoTransacao
        ? contexto.cliente
        : (() => {
            throw new Error('Contexto de transação inválido.');
          })();

    const expiraEm = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    await cliente.idempotencyRecord.create({
      data: {
        idempotencyKey: key,
        scope,
        requestHash,
        responseStatus: statusCode,
        responseBody: body as object,
        expiraEm,
      },
    });
  }
}
