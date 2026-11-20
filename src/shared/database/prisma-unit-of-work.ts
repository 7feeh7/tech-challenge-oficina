import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { PrismaContextoTransacao } from './prisma-contexto-transacao';
import type { ContextoTransacao, UnitOfWork } from './unit-of-work.port';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.timeoutMs = Number(
      configService.get<string>('DATABASE_TRANSACTION_TIMEOUT_MS') ?? '10000',
    );
  }

  async executar<T>(
    trabalho: (contexto: ContextoTransacao) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const contexto = new PrismaContextoTransacao(tx);
        return trabalho(contexto);
      },
      { timeout: this.timeoutMs },
    );
  }
}
