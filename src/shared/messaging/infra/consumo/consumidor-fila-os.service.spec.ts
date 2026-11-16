import { ConfigService } from '@nestjs/config';
import { ProcessarMensagemEntradaService } from '../../application/services/processar-mensagem-entrada.service';
import { ConteudoMensagemDivergenteError } from '../../domain/mensageria.errors';
import { ConsumidorFilaOsService } from './consumidor-fila-os.service';

const envelopeValido = {
  eventId: '550e8400-e29b-41d4-a716-446655440099',
  eventType: 'billing.orcamento-gerado.v1',
  version: 1,
  occurredAt: '2026-11-15T10:00:00.000Z',
  source: 'billing',
  correlationId: '550e8400-e29b-41d4-a716-446655440000',
  causationId: null,
  ordemServicoId: '550e8400-e29b-41d4-a716-446655440000',
  rodada: 1,
  payload: {},
};

describe('ConsumidorFilaOsService', () => {
  it('confirma mensagem após processamento bem-sucedido', async () => {
    const processar = {
      executar: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest.fn().mockResolvedValue([
        {
          corpo: JSON.stringify(envelopeValido),
          receiptHandle: 'rh',
        },
      ]),
      confirmar: jest.fn(),
      enviar: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_OS_IN_DLQ_URL') return 'dlq';
        if (k === 'SQS_CONSUMER_HABILITADO') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(config, fila, processar);
    await consumidor.poller();

    expect(processar.executar).toHaveBeenCalled();
    expect(fila.confirmar).toHaveBeenCalledWith('url', 'rh');
  });

  it('não confirma mensagem em erro transitório', async () => {
    const processar = {
      executar: jest.fn().mockRejectedValue(new Error('indisponível')),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest
        .fn()
        .mockResolvedValue([
          { corpo: JSON.stringify(envelopeValido), receiptHandle: 'rh' },
        ]),
      confirmar: jest.fn(),
      enviar: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_CONSUMER_HABILITADO') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(config, fila, processar);
    await consumidor.processarUma(JSON.stringify(envelopeValido), 'rh');
    expect(fila.confirmar).not.toHaveBeenCalled();
  });

  it('encaminha erro permanente à DLQ e confirma fila principal', async () => {
    const processar = {
      executar: jest
        .fn()
        .mockRejectedValue(new ConteudoMensagemDivergenteError('e')),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest.fn(),
      confirmar: jest.fn(),
      enviar: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_OS_IN_DLQ_URL') return 'dlq';
        if (k === 'SQS_CONSUMER_HABILITADO') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(config, fila, processar);
    await consumidor.processarUma(JSON.stringify(envelopeValido), 'rh');
    expect(fila.enviar).toHaveBeenCalledWith(
      'dlq',
      JSON.stringify(envelopeValido),
      envelopeValido.correlationId,
    );
    expect(fila.confirmar).toHaveBeenCalledWith('url', 'rh');
  });

  it('inicia polling somente com habilitado === true e URL', () => {
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_CONSUMER_HABILITADO') return 'true';
        if (k === 'SQS_CONSUMER_INTERVAL_MS') return '60000';
        return undefined;
      }),
    } as unknown as ConfigService;
    const consumidor = new ConsumidorFilaOsService(
      config,
      { receber: jest.fn() } as never,
      { executar: jest.fn() } as never,
    );
    consumidor.onModuleInit();
    expect((consumidor as { intervalo?: unknown }).intervalo).toBeDefined();
    consumidor.onModuleDestroy();
  });

  it('não confirma quando DLQ não está configurada em erro permanente', async () => {
    const processar = {
      executar: jest
        .fn()
        .mockRejectedValue(new ConteudoMensagemDivergenteError('e')),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest.fn(),
      confirmar: jest.fn(),
      enviar: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_CONSUMER_HABILITADO') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;
    const consumidor = new ConsumidorFilaOsService(
      config,
      fila as never,
      processar,
    );
    await expect(
      consumidor.processarUma(JSON.stringify(envelopeValido), 'rh'),
    ).rejects.toThrow();
    expect(fila.confirmar).not.toHaveBeenCalled();
  });

  it('não inicia polling quando consumidor desabilitado', () => {
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const consumidor = new ConsumidorFilaOsService(
      config,
      { receber: jest.fn() } as never,
      { executar: jest.fn() } as never,
    );
    consumidor.onModuleInit();
    expect((consumidor as { intervalo?: unknown }).intervalo).toBeUndefined();
  });
});
