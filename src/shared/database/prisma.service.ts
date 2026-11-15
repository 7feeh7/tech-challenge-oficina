import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
    const usarSsl = configService.get<string>('DATABASE_SSL') === 'true';
    const poolMax = Number(
      configService.get<string>('DATABASE_POOL_MAX') ?? '5',
    );
    const poolConnectionTimeoutMs = Number(
      configService.get<string>('DATABASE_POOL_CONNECTION_TIMEOUT_MS') ??
        '10000',
    );

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      max: poolMax,
      connectionTimeoutMillis: poolConnectionTimeoutMs,
      // O RDS recusa conexão sem TLS (`rds.force_ssl`), mas seu certificado é
      // emitido pela CA da Amazon, que não está no trust store do Node — validar
      // a cadeia falharia com "self-signed certificate". O tráfego segue
      // criptografado, e o banco só é alcançável de dentro da VPC privada.
      //
      // Continua desligado por padrão porque o Postgres local (compose/k8s local)
      // não fala TLS e recusaria a conexão.
      ...(usarSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
