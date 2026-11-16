import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';
import { AjustarEstoqueDivergenciaUseCase } from './ajustar-estoque-divergencia.use-case';

describe('AjustarEstoqueDivergenciaUseCase', () => {
  const uow = new UnitOfWorkFake();

  it('delega ajuste administrativo no gateway', async () => {
    const gateway: jest.Mocked<ReservaEstoqueGateway> = {
      buscarIdempotencia: jest.fn(),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn(),
      consumir: jest.fn(),
      listarLinhasAtivas: jest.fn(),
      ajustarFisicoAdministrativo: jest.fn(),
    };

    const useCase = new AjustarEstoqueDivergenciaUseCase(gateway, uow);
    await useCase.execute({
      pendenciaId: 'pend',
      pecaId: 'p1',
      quantidadeFisicaNova: 10,
      motivo: 'Contagem física',
      responsavelId: 'admin',
    });

    expect(gateway.ajustarFisicoAdministrativo).toHaveBeenCalled();
  });
});
