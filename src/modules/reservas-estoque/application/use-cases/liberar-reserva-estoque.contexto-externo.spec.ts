import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { LiberarReservaEstoqueUseCase } from './liberar-reserva-estoque.use-case';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';

describe('LiberarReservaEstoqueUseCase (contexto externo)', () => {
  it('usa a transação do chamador', async () => {
    const liberar = jest.fn().mockResolvedValue([]);
    const gateway: ReservaEstoqueGateway = {
      buscarIdempotencia: jest.fn().mockResolvedValue(null),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar,
      consumir: jest.fn(),
      listarLinhasAtivas: jest.fn(),
      possuiConsumoAplicado: jest.fn(),
      ajustarFisicoAdministrativo: jest.fn(),
    };
    const useCase = new LiberarReservaEstoqueUseCase(
      gateway,
      new UnitOfWorkFake(),
    );
    const contexto = new PrismaContextoTransacao({} as never);
    await useCase.execute(
      { ordemServicoId: 'os', rodada: 1, idempotencyKey: 'k1' },
      contexto,
    );
    expect(liberar).toHaveBeenCalledWith(contexto, 'os', 1);
  });
});
