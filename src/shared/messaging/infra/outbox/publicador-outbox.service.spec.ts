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

// As gravações curtas do publicador passam por `$transaction` para ter limite de execução.
function criarPrismaFake(
  updateMany: jest.Mock,
  mensagensReivindicadas: unknown[] = [],
) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(
      mensagensReivindicadas.map((mensagem) => ({
        id: (mensagem as { id: string }).id,
      })),
    ),
    outboxMensagem: {
      updateMany,
      findMany: jest.fn().mockResolvedValue(mensagensReivindicadas),
    },
  };
  return {
    tx,
    $transaction: jest.fn((trabalho: (cliente: unknown) => Promise<unknown>) =>
      trabalho(tx),
    ),
  };
}

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
    const prisma = criarPrismaFake(updateMany, [mensagem]);
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
    const prisma = criarPrismaFake(updateMany, [mensagem]);
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
      criarPrismaFake(updateMany) as never,
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
      criarPrismaFake(jest.fn().mockResolvedValue({ count: 1 })) as never,
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
    const prisma = criarPrismaFake(updateMany, [mensagem]);
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
      criarPrismaFake(updateMany) as never,
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

  describe('limites de tempo', () => {
    const mensagem = {
      id: 'm1',
      eventId: 'e1',
      destino: DESTINO_FILA_BILLING,
      envelope: { eventId: 'e1' },
      correlationId: 'c',
      tokenReivindicacao: 'tok-1',
    };

    const criarServico = (
      prisma: ReturnType<typeof criarPrismaFake>,
      enviar: jest.Mock,
      valores: Record<string, string> = {},
    ) =>
      new PublicadorOutboxService(
        prisma as never,
        {
          get: jest.fn((chave: string) => valores[chave]),
          getOrThrow: jest.fn().mockReturnValue('https://sqs/billing'),
        } as unknown as ConfigService,
        { enviar } as never,
        { publicar: jest.fn() },
        jsonLogger,
        mensageriaMetrics,
      );

    it('limita reivindicação, confirmação e backlog ao OUTBOX_PERSISTENCIA_MS', async () => {
      const prisma = criarPrismaFake(
        jest.fn().mockResolvedValue({ count: 1 }),
        [mensagem],
      );
      const metrics = criarMessagingMetricsFake();
      const service = new PublicadorOutboxService(
        prisma as never,
        {
          get: jest.fn((chave: string) =>
            chave === 'OUTBOX_PERSISTENCIA_MS' ? '1234' : undefined,
          ),
          getOrThrow: jest.fn().mockReturnValue('https://sqs/billing'),
        } as unknown as ConfigService,
        { enviar: jest.fn().mockResolvedValue(undefined) } as never,
        { publicar: jest.fn() },
        jsonLogger,
        metrics,
      );

      await service.publicarLote();

      // reivindicação + confirmação
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(
        prisma.tx.$queryRaw.mock.calls.map(([, limite]) => limite),
      ).toEqual(expect.arrayContaining(['1234']));
      for (const [, opcoes] of prisma.$transaction.mock.calls) {
        expect(opcoes).toEqual({ timeout: 1234 });
      }
      expect(metrics.recordOutboxBacklog).toHaveBeenCalledWith(1234);
    });

    it('limita a liberação da mensagem após falha de envio ao OUTBOX_PERSISTENCIA_MS', async () => {
      const prisma = criarPrismaFake(jest.fn().mockResolvedValue({ count: 1 }));
      const service = criarServico(
        prisma,
        jest.fn().mockRejectedValue(new Error('SQS down')),
        { OUTBOX_PERSISTENCIA_MS: '777' },
      );

      await service.publicarMensagemReivindicada(mensagem);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 777,
      });
    });

    it('usa 5000 ms de persistência e 450000 ms de posse por padrão', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const prisma = criarPrismaFake(updateMany, [mensagem]);
      const service = criarServico(
        prisma,
        jest.fn().mockResolvedValue(undefined),
      );

      const antes = Date.now();
      await service.reivindicarLote();

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
      });
      const { bloqueadoAte } = (
        updateMany.mock.calls[0][0] as { data: { bloqueadoAte: Date } }
      ).data;
      expect(bloqueadoAte.getTime() - antes).toBeGreaterThanOrEqual(450_000);
      expect(bloqueadoAte.getTime() - antes).toBeLessThan(451_000);
    });
  });
});
