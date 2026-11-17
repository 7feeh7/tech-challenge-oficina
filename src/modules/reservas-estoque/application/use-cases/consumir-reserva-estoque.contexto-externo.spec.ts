import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { ConsumirReservaEstoqueUseCase } from './consumir-reserva-estoque.use-case';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';

describe('ConsumirReservaEstoqueUseCase (contexto externo)', () => {
  it('participa da transação do chamador sem nova unidade', async () => {
    const consumir = jest.fn().mockResolvedValue({
      linhasAtualizadas: [],
      divergencias: [],
      pendenciaInventarioId: null,
    });
    const gateway: ReservaEstoqueGateway = {
      buscarIdempotencia: jest.fn().mockResolvedValue(null),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn(),
      consumir,
      listarLinhasAtivas: jest.fn(),
      possuiConsumoAplicado: jest.fn(),
      ajustarFisicoAdministrativo: jest.fn(),
    };
    const uow = new UnitOfWorkFake();
    const useCase = new ConsumirReservaEstoqueUseCase(gateway, uow);
    const contexto = new PrismaContextoTransacao({} as never);
    await useCase.execute(
      {
        ordemServicoId: 'os',
        rodada: 1,
        itensUtilizados: [{ pecaId: 'p1', quantidade: 1 }],
        idempotencyKey: 'k1',
      },
      contexto,
    );
    expect(consumir).toHaveBeenCalledWith(contexto, expect.any(Object));
  });
});
