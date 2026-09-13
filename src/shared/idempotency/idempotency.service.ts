import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/shared/database/prisma.service';

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
}
