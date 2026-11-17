import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { ConteudoMensagemDivergenteError } from '../../domain/mensageria.errors';
import { EnvelopeMensagemInvalidoError } from '../../validar-envelope';
import type { MensagemProcessadaGateway } from '../ports/mensagem-processada.gateway';
import type { ProcessadorMensagem } from '../ports/processador-mensagem.port';
import { RoteadorProcessadoresMensagemService } from './roteador-processadores-mensagem.service';
import {
  criarJsonLoggerMensageriaFake,
  criarMessagingMetricsFake,
  criarOsMetricsMensageriaFake,
} from '../../testing/observabilidade-mensageria.test-doubles';
import { ProcessarMensagemEntradaService } from './processar-mensagem-entrada.service';

const logger = criarJsonLoggerMensageriaFake();
const mensageriaMetrics = criarMessagingMetricsFake();
const osMetrics = criarOsMetricsMensageriaFake();

const envelope = {
  eventId: '550e8400-e29b-41d4-a716-446655440099',
  eventType: 'mensageria.teste-integracao.v1',
  version: 1,
  occurredAt: '2026-11-15T10:00:00.000Z',
  source: 'teste',
  correlationId: '550e8400-e29b-41d4-a716-446655440000',
  causationId: null,
  ordemServicoId: '550e8400-e29b-41d4-a716-446655440000',
  rodada: 1,
  payload: { marcador: 1 },
};

describe('ProcessarMensagemEntradaService', () => {
  it('rejeita corpo que não é JSON', async () => {
    const uow = new UnitOfWorkFake();
    const roteador = new RoteadorProcessadoresMensagemService([]);
    const servico = new ProcessarMensagemEntradaService(
      uow,
      {
        jaProcessada: () => Promise.resolve(false),
        registrar: () => Promise.resolve(),
        buscarHash: () => Promise.resolve(null),
      },
      roteador,
      logger,
      mensageriaMetrics,
      osMetrics,
    );
    await expect(servico.executar('{invalido')).rejects.toThrow(
      EnvelopeMensagemInvalidoError,
    );
  });
  it('deduplica eventId já processado com mesmo hash', async () => {
    const efeitos: string[] = [];
    const processador: ProcessadorMensagem = {
      eventType: 'mensageria.teste-integracao.v1',
      processar: () => {
        efeitos.push('ok');
        return Promise.resolve();
      },
    };
    const hashes = new Map<string, string>();
    const mensagens: MensagemProcessadaGateway = {
      jaProcessada: (_c, eventId) => Promise.resolve(hashes.has(eventId)),
      registrar: (_c, eventId, hash) => {
        hashes.set(eventId, hash);
        return Promise.resolve();
      },
      buscarHash: (_c, eventId) => Promise.resolve(hashes.get(eventId) ?? null),
    };
    const uow = new UnitOfWorkFake();
    const roteador = new RoteadorProcessadoresMensagemService([processador]);
    const servico = new ProcessarMensagemEntradaService(
      uow,
      mensagens,
      roteador,
      logger,
      mensageriaMetrics,
      osMetrics,
    );

    await servico.executar(JSON.stringify(envelope));
    await servico.executar(JSON.stringify(envelope));

    expect(efeitos).toHaveLength(1);
  });

  it('repete após P2002 em mensagem processada sem segundo efeito', async () => {
    const efeitos: string[] = [];
    const processador: ProcessadorMensagem = {
      eventType: 'mensageria.teste-integracao.v1',
      processar: () => {
        efeitos.push('ok');
        return Promise.resolve();
      },
    };
    const hashes = new Map<string, string>();
    let tentativasRegistrar = 0;
    const mensagens: MensagemProcessadaGateway = {
      jaProcessada: (_c, eventId) => Promise.resolve(hashes.has(eventId)),
      registrar: (_c, eventId, hash) => {
        tentativasRegistrar += 1;
        if (tentativasRegistrar === 1) {
          hashes.set(eventId, hash);
          throw Object.assign(new Error('Unique'), {
            code: 'P2002',
            meta: { modelName: 'MensagemProcessada' },
          });
        }
        return Promise.resolve();
      },
      buscarHash: (_c, eventId) => Promise.resolve(hashes.get(eventId) ?? null),
    };
    const uow = new UnitOfWorkFake();
    const roteador = new RoteadorProcessadoresMensagemService([processador]);
    const servico = new ProcessarMensagemEntradaService(
      uow,
      mensagens,
      roteador,
      logger,
      mensageriaMetrics,
      osMetrics,
    );

    await servico.executar(JSON.stringify(envelope));

    expect(efeitos).toHaveLength(1);
    expect(tentativasRegistrar).toBe(1);
  });

  it('rejeita conteúdo divergente para mesmo eventId', async () => {
    const processador: ProcessadorMensagem = {
      eventType: 'mensageria.teste-integracao.v1',
      processar: () => Promise.resolve(),
    };
    const mensagens: MensagemProcessadaGateway = {
      jaProcessada: () => Promise.resolve(true),
      registrar: () => Promise.resolve(),
      buscarHash: () => Promise.resolve('hash-antigo'),
    };
    const uow = new UnitOfWorkFake();
    const roteador = new RoteadorProcessadoresMensagemService([processador]);
    const servico = new ProcessarMensagemEntradaService(
      uow,
      mensagens,
      roteador,
      logger,
      mensageriaMetrics,
      osMetrics,
    );

    await expect(servico.executar(JSON.stringify(envelope))).rejects.toThrow(
      ConteudoMensagemDivergenteError,
    );
  });
});
