import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import type { ProcessadorMensagem } from '../ports/processador-mensagem.port';
import { RoteadorProcessadoresMensagemService } from './roteador-processadores-mensagem.service';
import {
  criarMessagingMetricsFake,
  criarOsMetricsMensageriaFake,
} from '../../testing/observabilidade-mensageria.test-doubles';
import { ProcessarMensagemEntradaService } from './processar-mensagem-entrada.service';

const correlationId = '550e8400-e29b-41d4-a716-446655440000';

const envelope = {
  eventId: '550e8400-e29b-41d4-a716-446655440099',
  eventType: 'mensageria.teste-integracao.v1',
  version: 1,
  occurredAt: '2026-11-15T10:00:00.000Z',
  source: 'teste',
  correlationId,
  causationId: null,
  ordemServicoId: '550e8400-e29b-41d4-a716-446655440001',
  rodada: 1,
  payload: { marcador: 1 },
};

describe('ProcessarMensagemEntradaService — observabilidade', () => {
  it('registra log estruturado com o mesmo correlationId do envelope', async () => {
    const stdout = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const logger = new JsonLoggerService();
    const mensageriaMetrics = criarMessagingMetricsFake();
    const osMetrics = criarOsMetricsMensageriaFake();
    const processador: ProcessadorMensagem = {
      eventType: envelope.eventType,
      processar: () => Promise.resolve(),
    };
    const mensagens = {
      jaProcessada: () => Promise.resolve(false),
      registrar: () => Promise.resolve(),
      buscarHash: () => Promise.resolve(null),
    };
    const servico = new ProcessarMensagemEntradaService(
      new UnitOfWorkFake(),
      mensagens,
      new RoteadorProcessadoresMensagemService([processador]),
      logger,
      mensageriaMetrics,
      osMetrics,
    );

    await servico.executar(JSON.stringify(envelope));

    const logs = stdout.mock.calls.map((c) => JSON.parse(String(c[0])));
    const processado = logs.find(
      (l) => l.message === 'mensagem.consumo.processada',
    );
    expect(processado?.correlationId).toBe(correlationId);
    expect(processado?.eventId).toBe(envelope.eventId);
    expect(processado?.ordemServicoId).toBe(envelope.ordemServicoId);
    stdout.mockRestore();
  });
});
