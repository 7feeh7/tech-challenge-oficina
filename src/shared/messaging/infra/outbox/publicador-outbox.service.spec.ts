import { ConfigService } from '@nestjs/config';
import {
  DESTINO_FILA_BILLING,
  DESTINO_FILA_EXECUTION,
  DESTINO_TOPICO_NOTIFICACAO,
} from '../../envelope';
import {
  criarJsonLoggerMensageriaFake,
  criarMessagingMetricsFake,
} from '../../testing/observabilidade-mensageria.test-doubles';
import { PublicadorOutboxService } from './publicador-outbox.service';

const jsonLogger = criarJsonLoggerMensageriaFake();
const mensageriaMetrics = criarMessagingMetricsFake();

describe('PublicadorOutboxService', () => {
  it('não agenda publicação quando habilitado ausente ou diferente de true', () => {
    for (const valor of [undefined, 'false', '1', '']) {
      const config = {
        get: jest.fn((k: string) => {
          if (k === 'OUTBOX_PUBLISHER_HABILITADO') return valor;
          return undefined;
        }),
        getOrThrow: jest.fn(),
      } as unknown as ConfigService;
      const service = new PublicadorOutboxService(
        { $transaction: jest.fn() } as never,
        config,
        { enviar: jest.fn() } as never,
        { publicar: jest.fn() },
        jsonLogger,
        mensageriaMetrics,
      );
      service.onModuleInit();
      expect((service as { agendador?: unknown }).agendador).toBeUndefined();
    }
  });

  it('publica mensagens reivindicadas e marca como enviadas com fencing', async () => {
    const mensagem = {
      id: 'm1',
      destino: DESTINO_FILA_BILLING,
      envelope: {
        eventId: 'e1',
        eventType: 'os.teste.v1',
        version: 1,
        occurredAt: 't',
        source: 'os-service',
        correlationId: 'c',
        causationId: null,
        ordemServicoId: 'os',
        rodada: 1,
        payload: {},
      },
      correlationId: 'c',
      eventId: 'e1',
      tokenReivindicacao: 'tok-1',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'm1' }]),
          outboxMensagem: {
            updateMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([mensagem]),
          },
        }),
      ),
      outboxMensagem: { updateMany },
    };
    const fila = { enviar: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'OUTBOX_PUBLISHER_HABILITADO') return 'true';
        if (k === 'OUTBOX_PUBLISHER_INTERVAL_MS') return '99999';
        if (k === 'OUTBOX_REIVINDICACAO_MS') return '30000';
        return undefined;
      }),
      getOrThrow: jest.fn().mockReturnValue('https://sqs/billing'),
    } as unknown as ConfigService;

    const service = new PublicadorOutboxService(
      prisma as never,
      config,
      fila as never,
      { publicar: jest.fn() },
      jsonLogger,
      mensageriaMetrics,
    );
    await service.publicarLote();

    expect(fila.enviar).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'm1',
          tokenReivindicacao: 'tok-1',
        }),
        data: expect.objectContaining({ enviadoEm: expect.any(Date) }),
      }),
    );
  });

  it('publica via SNS quando destino é notificação', async () => {
    const mensagem = {
      id: 'm2',
      destino: DESTINO_TOPICO_NOTIFICACAO,
      envelope: { eventId: 'e2' },
      correlationId: 'c',
      eventId: 'e2',
      tokenReivindicacao: 'tok-2',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'm2' }]),
          outboxMensagem: {
            updateMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([mensagem]),
          },
        }),
      ),
      outboxMensagem: { updateMany },
    };
    const notificacao = { publicar: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn().mockReturnValue('true'),
      getOrThrow: jest.fn(),
    } as unknown as ConfigService;

    const service = new PublicadorOutboxService(
      prisma as never,
      config,
      { enviar: jest.fn() } as never,
      notificacao,
      jsonLogger,
      mensageriaMetrics,
    );
    await service.publicarLote();
    expect(notificacao.publicar).toHaveBeenCalled();
  });

  it('agenda publicação quando habilitado === true', async () => {
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'OUTBOX_PUBLISHER_HABILITADO') return 'true';
        if (k === 'OUTBOX_PUBLISHER_INTERVAL_MS') return '60000';
        return undefined;
      }),
      getOrThrow: jest.fn(),
    } as unknown as ConfigService;
    const service = new PublicadorOutboxService(
      { $transaction: jest.fn() } as never,
      config,
      { enviar: jest.fn() } as never,
      { publicar: jest.fn() },
      jsonLogger,
      mensageriaMetrics,
    );
    service.onModuleInit();
    expect((service as { agendador?: unknown }).agendador).toBeDefined();
    await service.onModuleDestroy();
  });

  it('não confirma envio quando perde fencing', async () => {
    const mensagem = {
      id: 'm1',
      destino: DESTINO_FILA_BILLING,
      envelope: { eventId: 'e1' },
      correlationId: 'c',
      eventId: 'e1',
      tokenReivindicacao: 'tok-1',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const fila = { enviar: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn(),
      getOrThrow: jest.fn().mockReturnValue('https://sqs/billing'),
    } as unknown as ConfigService;
    const service = new PublicadorOutboxService(
      { outboxMensagem: { updateMany } } as never,
      config,
      fila as never,
      { publicar: jest.fn() },
      jsonLogger,
      mensageriaMetrics,
    );
    await service.publicarMensagemReivindicada(mensagem);
    expect(updateMany).toHaveBeenCalled();
  });

  it('publica na fila execution quando destino é execution-in', async () => {
    const mensagem = {
      id: 'm3',
      destino: DESTINO_FILA_EXECUTION,
      envelope: { eventId: 'e3' },
      correlationId: 'c',
      eventId: 'e3',
      tokenReivindicacao: 'tok-3',
    };
    const fila = { enviar: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn(),
      getOrThrow: jest.fn().mockReturnValue('https://sqs/execution'),
    } as unknown as ConfigService;
    const service = new PublicadorOutboxService(
      {
        outboxMensagem: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      } as never,
      config,
      fila as never,
      { publicar: jest.fn() },
      jsonLogger,
      mensageriaMetrics,
    );
    await service.publicarMensagemReivindicada(mensagem);
    expect(fila.enviar).toHaveBeenCalledWith(
      'https://sqs/execution',
      mensagem.envelope,
      'c',
    );
  });

  it('ignora publicação sem token de reivindicação', async () => {
    const fila = { enviar: jest.fn() };
    const service = new PublicadorOutboxService(
      { outboxMensagem: { updateMany: jest.fn() } } as never,
      { get: jest.fn(), getOrThrow: jest.fn() } as never,
      fila as never,
      { publicar: jest.fn() },
      jsonLogger,
      mensageriaMetrics,
    );
    await service.publicarMensagemReivindicada({
      id: 'm',
      destino: DESTINO_FILA_BILLING,
      envelope: {},
      correlationId: 'c',
      eventId: 'e',
      tokenReivindicacao: null,
    });
    expect(fila.enviar).not.toHaveBeenCalled();
  });

  it('incrementa tentativas quando envio à fila falha', async () => {
    const mensagem = {
      id: 'm1',
      eventId: 'e1',
      destino: DESTINO_FILA_BILLING,
      envelope: { eventId: 'e1' },
      correlationId: 'c',
      tokenReivindicacao: 'tok-1',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'm1' }]),
          outboxMensagem: {
            updateMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([mensagem]),
          },
        }),
      ),
      outboxMensagem: { updateMany },
    };
    const fila = { enviar: jest.fn().mockRejectedValue(new Error('SQS down')) };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'OUTBOX_PUBLISHER_HABILITADO') return 'true';
        return undefined;
      }),
      getOrThrow: jest.fn().mockReturnValue('https://sqs/billing'),
    } as unknown as ConfigService;

    const service = new PublicadorOutboxService(
      prisma as never,
      config,
      fila as never,
      { publicar: jest.fn() },
      jsonLogger,
      mensageriaMetrics,
    );
    await service.publicarLote();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tentativas: { increment: 1 },
          bloqueadoAte: expect.any(Date),
          tokenReivindicacao: null,
        }),
      }),
    );
  });

  it('grava bloqueado_ate progressivo após falha conforme tentativas', async () => {
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'OUTBOX_RETRY_BASE_MS') return '1000';
        if (k === 'OUTBOX_RETRY_TETO_MS') return '30000';
        return undefined;
      }),
      getOrThrow: jest.fn().mockReturnValue('https://sqs/billing'),
    } as unknown as ConfigService;
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const fila = {
      enviar: jest.fn().mockRejectedValue(new Error('falha')),
    };
    const service = new PublicadorOutboxService(
      { outboxMensagem: { updateMany } } as never,
      config,
      fila as never,
      { publicar: jest.fn() },
      jsonLogger,
      mensageriaMetrics,
    );
    await service.publicarMensagemReivindicada({
      id: 'm1',
      destino: DESTINO_FILA_BILLING,
      envelope: {},
      correlationId: 'c',
      eventId: 'e1',
      tokenReivindicacao: 'tok',
      tentativas: 1,
    });
    const chamada = updateMany.mock.calls[0][0] as {
      data: { bloqueadoAte: Date };
    };
    const esperadoMs = 2000;
    const diff = chamada.data.bloqueadoAte.getTime() - Date.now();
    expect(diff).toBeGreaterThanOrEqual(esperadoMs - 50);
    expect(diff).toBeLessThanOrEqual(esperadoMs + 50);
  });
});
