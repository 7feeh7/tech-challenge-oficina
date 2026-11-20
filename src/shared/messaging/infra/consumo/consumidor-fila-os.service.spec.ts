import { ConfigService } from '@nestjs/config';
import { ProcessarMensagemEntradaService } from '../../application/services/processar-mensagem-entrada.service';
import { ConteudoMensagemDivergenteError } from '../../domain/mensageria.errors';
import {
  criarMessagingMetricsFake,
  criarOsMetricsMensageriaFake,
} from '../../testing/observabilidade-mensageria.test-doubles';
import { ConsumidorFilaOsService } from './consumidor-fila-os.service';

const mensageriaMetrics = criarMessagingMetricsFake();
const osMetrics = criarOsMetricsMensageriaFake();

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
      enviarCorpoBruto: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_OS_IN_DLQ_URL') return 'dlq';
        if (k === 'SQS_CONSUMER_HABILITADO') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(
      config,
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
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
      enviarCorpoBruto: jest.fn(),
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
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
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
      enviarCorpoBruto: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_OS_IN_DLQ_URL') return 'dlq';
        if (k === 'SQS_CONSUMER_HABILITADO') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(
      config,
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
    await consumidor.processarUma(JSON.stringify(envelopeValido), 'rh');
    expect(fila.enviarCorpoBruto).toHaveBeenCalledWith(
      'dlq',
      JSON.stringify(envelopeValido),
      envelopeValido.correlationId,
    );
    expect(fila.confirmar).toHaveBeenCalledWith('url', 'rh');
  });

  it('envia à DLQ o corpo bruto sem re-serializar (inclusive não-JSON)', async () => {
    const corpoNaoJson = 'texto{quebra"json';
    const processar = {
      executar: jest
        .fn()
        .mockRejectedValue(new ConteudoMensagemDivergenteError('e')),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest.fn(),
      confirmar: jest.fn(),
      enviar: jest.fn(),
      enviarCorpoBruto: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_OS_IN_DLQ_URL') return 'dlq';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(
      config,
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
    await consumidor.processarUma(corpoNaoJson, 'rh');
    expect(fila.enviarCorpoBruto).toHaveBeenCalledWith(
      'dlq',
      corpoNaoJson,
      expect.any(String),
    );
  });

  it('não confirma a original quando o envio à DLQ falha', async () => {
    const processar = {
      executar: jest
        .fn()
        .mockRejectedValue(new ConteudoMensagemDivergenteError('e')),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest.fn(),
      confirmar: jest.fn(),
      enviar: jest.fn(),
      enviarCorpoBruto: jest.fn().mockRejectedValue(new Error('SQS down')),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_OS_IN_DLQ_URL') return 'dlq';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(
      config,
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
    await consumidor.processarUma(JSON.stringify(envelopeValido), 'rh');
    expect(fila.confirmar).not.toHaveBeenCalled();
  });

  it('falha na DLQ de uma mensagem não interrompe as demais do lote', async () => {
    const processar = {
      executar: jest
        .fn()
        .mockRejectedValueOnce(new ConteudoMensagemDivergenteError('e'))
        .mockResolvedValueOnce(undefined),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest.fn().mockResolvedValue([
        { corpo: 'permanente', receiptHandle: 'rh1' },
        { corpo: JSON.stringify(envelopeValido), receiptHandle: 'rh2' },
      ]),
      confirmar: jest.fn(),
      enviar: jest.fn(),
      enviarCorpoBruto: jest.fn().mockRejectedValue(new Error('DLQ off')),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        if (k === 'SQS_OS_IN_DLQ_URL') return 'dlq';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(
      config,
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
    await consumidor.poller();
    expect(processar.executar).toHaveBeenCalledTimes(2);
    expect(fila.confirmar).toHaveBeenCalledWith('url', 'rh2');
    expect(fila.confirmar).not.toHaveBeenCalledWith('url', 'rh1');
  });

  it('inicia polling somente com habilitado === true e URL', async () => {
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
      mensageriaMetrics,
      osMetrics,
    );
    consumidor.onModuleInit();
    expect((consumidor as { agendador?: unknown }).agendador).toBeDefined();
    await consumidor.onModuleDestroy();
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
      enviarCorpoBruto: jest.fn(),
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
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
    await consumidor.processarUma(JSON.stringify(envelopeValido), 'rh');
    expect(fila.confirmar).not.toHaveBeenCalled();
  });

  it('falha ao confirmar após processamento bem-sucedido não conclui consumo na fila', async () => {
    const processar = {
      executar: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProcessarMensagemEntradaService;
    const fila = {
      receber: jest.fn(),
      confirmar: jest.fn().mockRejectedValue(new Error('SQS indisponível')),
      enviar: jest.fn(),
      enviarCorpoBruto: jest.fn(),
    };
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'SQS_OS_IN_URL') return 'url';
        return undefined;
      }),
    } as unknown as ConfigService;

    const consumidor = new ConsumidorFilaOsService(
      config,
      fila,
      processar,
      mensageriaMetrics,
      osMetrics,
    );
    await consumidor.processarUma(JSON.stringify(envelopeValido), 'rh');
    expect(processar.executar).toHaveBeenCalled();
    expect(fila.confirmar).toHaveBeenCalled();
  });

  it('não inicia polling quando consumidor desabilitado', () => {
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const consumidor = new ConsumidorFilaOsService(
      config,
      { receber: jest.fn() } as never,
      { executar: jest.fn() } as never,
      mensageriaMetrics,
      osMetrics,
    );
    consumidor.onModuleInit();
    expect((consumidor as { agendador?: unknown }).agendador).toBeUndefined();
  });
});
