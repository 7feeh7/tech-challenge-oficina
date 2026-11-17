import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { ResolverConsumoManualUseCase } from './resolver-consumo-manual.use-case';

describe('ResolverConsumoManualUseCase', () => {
  const contexto = { __contextoTransacao: Symbol() } as ContextoTransacao;

  it('executa resolução e idempotência na mesma transação', async () => {
    const reservas = {
      buscarIdempotencia: jest.fn().mockResolvedValue(null),
      resolverConsumoManualInicial: jest.fn().mockResolvedValue({
        ordemServicoId: 'os-1',
        rodada: 1,
        resolucaoId: 'res-1',
      }),
      gravarIdempotencia: jest.fn(),
    };
    const uow = {
      executar: (fn: (c: ContextoTransacao) => unknown) => fn(contexto),
    };
    const retomada = { retomarAposResolucaoInventario: jest.fn() };
    const uc = new ResolverConsumoManualUseCase(
      reservas as never,
      uow as never,
      retomada,
    );

    const out = await uc.execute({
      pendenciaId: 'pend-1',
      itensConsumidos: [{ pecaId: 'p1', quantidade: 1 }],
      itensLiberados: [],
      motivo: 'decisão administrativa',
      responsavelId: 'admin-1',
      idempotencyKey: 'resolucao:pend-1',
    });

    expect(out.resolucaoId).toBe('res-1');
    expect(retomada.retomarAposResolucaoInventario).toHaveBeenCalled();
    expect(reservas.gravarIdempotencia).toHaveBeenCalled();
  });

  it('reutiliza replay idempotente sem chamar gateway novamente', async () => {
    const reservas = {
      buscarIdempotencia: jest.fn().mockResolvedValue({
        resultado: { ordemServicoId: 'os-1', rodada: 1, resolucaoId: 'res-0' },
      }),
      resolverConsumoManualInicial: jest.fn(),
      gravarIdempotencia: jest.fn(),
    };
    const uow = {
      executar: (fn: (c: ContextoTransacao) => unknown) => fn(contexto),
    };
    const retomada = { retomarAposResolucaoInventario: jest.fn() };
    const uc = new ResolverConsumoManualUseCase(
      reservas as never,
      uow as never,
      retomada,
    );

    const out = await uc.execute({
      pendenciaId: 'pend-1',
      itensConsumidos: [{ pecaId: 'p1', quantidade: 1 }],
      itensLiberados: [],
      motivo: 'decisão administrativa',
      responsavelId: 'admin-1',
      idempotencyKey: 'resolucao:pend-1',
    });

    expect(out.reutilizado).toBe(true);
    expect(reservas.resolverConsumoManualInicial).not.toHaveBeenCalled();
    expect(retomada.retomarAposResolucaoInventario).not.toHaveBeenCalled();
  });

  it('aceita contexto externo sem abrir nova transação', async () => {
    const reservas = {
      buscarIdempotencia: jest.fn().mockResolvedValue(null),
      resolverConsumoManualInicial: jest.fn().mockResolvedValue({
        ordemServicoId: 'os-2',
        rodada: 2,
        resolucaoId: 'res-2',
      }),
      gravarIdempotencia: jest.fn(),
    };
    const uow = { executar: jest.fn() };
    const retomada = { retomarAposResolucaoInventario: jest.fn() };
    const uc = new ResolverConsumoManualUseCase(
      reservas as never,
      uow as never,
      retomada,
    );

    await uc.execute(
      {
        pendenciaId: 'pend-2',
        itensConsumidos: [],
        itensLiberados: [{ pecaId: 'p1', quantidade: 1 }],
        motivo: 'ajuste',
        responsavelId: 'admin-2',
        idempotencyKey: 'k2',
      },
      contexto,
    );

    expect(uow.executar).not.toHaveBeenCalled();
    expect(reservas.resolverConsumoManualInicial).toHaveBeenCalled();
  });
});
