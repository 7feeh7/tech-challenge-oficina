import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';
import { ConsumirReservaEstoqueUseCase } from './consumir-reserva-estoque.use-case';

describe('ConsumirReservaEstoqueUseCase', () => {
  const uow = new UnitOfWorkFake();

  it('consome reservas e grava idempotência', async () => {
    const gateway: jest.Mocked<ReservaEstoqueGateway> = {
      buscarIdempotencia: jest.fn().mockResolvedValue(null),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn(),
      consumir: jest.fn().mockResolvedValue({
        linhasAtualizadas: [],
        divergencias: [],
        pendenciaInventarioId: null,
      }),
      listarLinhasAtivas: jest.fn(),
      ajustarFisicoAdministrativo: jest.fn(),
    };

    const useCase = new ConsumirReservaEstoqueUseCase(gateway, uow);
    await useCase.execute({
      ordemServicoId: 'os',
      rodada: 1,
      itensUtilizados: [{ pecaId: 'p1', quantidade: 1 }],
      idempotencyKey: 'consumir:os:1',
    });

    expect(gateway.consumir).toHaveBeenCalled();
    expect(gateway.gravarIdempotencia).toHaveBeenCalled();
  });

  it('reutiliza resultado idempotente', async () => {
    const gateway: jest.Mocked<ReservaEstoqueGateway> = {
      buscarIdempotencia: jest.fn().mockResolvedValue({
        reutilizado: true,
        resultado: {
          linhasAtualizadas: [],
          divergencias: [],
          pendenciaInventarioId: null,
          reutilizado: false,
        },
      }),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn(),
      consumir: jest.fn(),
      listarLinhasAtivas: jest.fn(),
      ajustarFisicoAdministrativo: jest.fn(),
    };

    const useCase = new ConsumirReservaEstoqueUseCase(gateway, uow);
    const out = await useCase.execute({
      ordemServicoId: 'os',
      rodada: 1,
      itensUtilizados: [],
      idempotencyKey: 'c',
    });

    expect(out.reutilizado).toBe(true);
    expect(gateway.consumir).not.toHaveBeenCalled();
  });
});