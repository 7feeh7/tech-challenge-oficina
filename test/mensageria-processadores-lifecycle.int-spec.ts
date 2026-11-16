import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/shared/database/prisma.service';
import type { FilaMensagensGateway } from '@/shared/messaging/application/ports/fila-mensagens.gateway';
import {
  FILA_MENSAGENS,
  PUBLICACAO_NOTIFICACAO,
} from '@/shared/messaging/application/ports/tokens';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { ConsumidorFilaOsService } from '@/shared/messaging/infra/consumo/consumidor-fila-os.service';
import { PublicadorOutboxService } from '@/shared/messaging/infra/outbox/publicador-outbox.service';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('Lifecycle dos processadores de mensageria', () => {
  it('encerram o ciclo antes do onModuleDestroy do Prisma no módulo Nest', async () => {
    const ordem: string[] = [];

    const fila: FilaMensagensGateway = {
      receber: (_url, _q, opcoes) =>
        new Promise((resolve) => {
          opcoes?.sinalAbortamento?.addEventListener(
            'abort',
            () => resolve([]),
            { once: true },
          );
        }),
      confirmar: jest.fn(),
      enviar: jest.fn(),
      enviarCorpoBruto: jest.fn(),
    };

    const prismaDestroy = jest.fn(() => {
      ordem.push('prisma');
      return Promise.resolve();
    });

    const nestModule: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              OUTBOX_PUBLISHER_HABILITADO: 'true',
              SQS_CONSUMER_HABILITADO: 'true',
              SQS_OS_IN_URL: 'https://local/os-in',
              SQS_OS_IN_DLQ_URL: 'https://local/dlq',
              SQS_BILLING_IN_URL: 'https://local/billing-in',
              OUTBOX_PUBLISHER_INTERVAL_MS: '999999',
              SQS_CONSUMER_INTERVAL_MS: '999999',
            }),
          ],
        }),
      ],
      providers: [
        ConsumidorFilaOsService,
        PublicadorOutboxService,
        {
          provide: ProcessarMensagemEntradaService,
          useValue: { executar: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn().mockResolvedValue([]),
            outboxMensagem: {
              updateMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            onModuleDestroy: prismaDestroy,
          },
        },
        { provide: FILA_MENSAGENS, useValue: fila },
        { provide: PUBLICACAO_NOTIFICACAO, useValue: { publicar: jest.fn() } },
      ],
    }).compile();

    const consumidor = nestModule.get(ConsumidorFilaOsService);
    const publicador = nestModule.get(PublicadorOutboxService);

    const encerrarConsumidor = consumidor.onModuleDestroy.bind(consumidor);
    consumidor.onModuleDestroy = async () => {
      ordem.push('consumidor');
      await encerrarConsumidor();
    };

    const encerrarPublicador = publicador.onModuleDestroy.bind(publicador);
    publicador.onModuleDestroy = async () => {
      ordem.push('publicador');
      await encerrarPublicador();
    };

    await nestModule.init();
    await nestModule.close();

    expect(ordem.indexOf('consumidor')).toBeLessThan(ordem.indexOf('prisma'));
    expect(ordem.indexOf('publicador')).toBeLessThan(ordem.indexOf('prisma'));

    await fecharModuloIntegracao(nestModule);
  });
});