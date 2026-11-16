import { ConfigService } from '@nestjs/config';
import {
  DESTINO_FILA_BILLING,
  DESTINO_FILA_EXECUTION,
  DESTINO_TOPICO_NOTIFICACAO,
} from '../../envelope';
import { PublicadorOutboxService } from './publicador-outbox.service';

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
      );
      service.onModuleInit();
      expect((service as { intervalo?: unknown }).intervalo).toBeUndefined();
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
      notificacao as never,
    );
    await service.publicarLote();
    expect(notificacao.publicar).toHaveBeenCalled();
  });

  it('agenda publicação quando habilitado === true', () => {
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
      { publicar: jest.fn() } as never,
    );
    service.onModuleInit();
    expect((service as { intervalo?: unknown }).intervalo).toBeDefined();
    service.onModuleDestroy();
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
      { publicar: jest.fn() } as never,
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
      { publicar: jest.fn() } as never,
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
      { publicar: jest.fn() } as never,
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
    );
    await service.publicarLote();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tentativas: { increment: 1 } }),
      }),
    );
  });
});
