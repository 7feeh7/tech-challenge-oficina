import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';
import { LiberarReservaEstoqueUseCase } from './liberar-reserva-estoque.use-case';

describe('LiberarReservaEstoqueUseCase', () => {
  const uow = new UnitOfWorkFake();

  it('libera reservas e grava idempotência', async () => {
    const gateway: jest.Mocked<ReservaEstoqueGateway> = {
      buscarIdempotencia: jest.fn().mockResolvedValue(null),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn().mockResolvedValue([]),
      consumir: jest.fn(),
      listarLinhasAtivas: jest.fn(),
      ajustarFisicoAdministrativo: jest.fn(),
    };

    const useCase = new LiberarReservaEstoqueUseCase(gateway, uow);
    await useCase.execute({
      ordemServicoId: 'os',
      rodada: 1,
      idempotencyKey: 'liberar:os:1',
    });

    expect(gateway.liberar).toHaveBeenCalled();
    expect(gateway.gravarIdempotencia).toHaveBeenCalled();
  });

  it('reutiliza resultado idempotente', async () => {
    const gateway: jest.Mocked<ReservaEstoqueGateway> = {
      buscarIdempotencia: jest.fn().mockResolvedValue({
        reutilizado: true,
        resultado: { linhas: [], reutilizado: false },
      }),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn(),
      consumir: jest.fn(),
      listarLinhasAtivas: jest.fn(),
      ajustarFisicoAdministrativo: jest.fn(),
    };

    const useCase = new LiberarReservaEstoqueUseCase(gateway, uow);
    const out = await useCase.execute({
      ordemServicoId: 'os',
      rodada: 1,
      idempotencyKey: 'lib',
    });

    expect(out.reutilizado).toBe(true);
    expect(gateway.liberar).not.toHaveBeenCalled();
  });
});
