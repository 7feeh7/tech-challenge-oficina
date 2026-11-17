import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { EVENTO_REPARO_FALHOU } from '@/shared/messaging/envelope';
import { ProcessadoresSagaProvider } from './processadores-saga.provider';

describe('ProcessadoresSagaProvider', () => {
  it('registra processadores delegando ao ReagirFatoSagaUseCase', async () => {
    const saga = { executar: jest.fn().mockResolvedValue(undefined) };
    const provider = new ProcessadoresSagaProvider(saga as never);
    const proc = provider.lista.find(
      (p) => p.eventType === EVENTO_REPARO_FALHOU,
    );
    expect(proc).toBeDefined();
    const ctx = { __contextoTransacao: Symbol() } as ContextoTransacao;
    const envelope = { eventId: 'e1' } as never;
    await proc!.processar(ctx, envelope);
    expect(saga.executar).toHaveBeenCalledWith(ctx, envelope);
  });
});
