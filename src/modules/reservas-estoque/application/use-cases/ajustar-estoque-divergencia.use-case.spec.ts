import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';
import { AjustarEstoqueDivergenciaUseCase } from './ajustar-estoque-divergencia.use-case';

describe('AjustarEstoqueDivergenciaUseCase', () => {
  const uow = new UnitOfWorkFake();

  const montar = (pendenciaResolvida: boolean) => {
    const gateway: jest.Mocked<ReservaEstoqueGateway> = {
      buscarIdempotencia: jest.fn(),
      gravarIdempotencia: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn(),
      consumir: jest.fn(),
      listarLinhasAtivas: jest.fn(),
      ajustarFisicoAdministrativo: jest
        .fn()
        .mockResolvedValue({ ordemServicoId: 'os-1', pendenciaResolvida }),
      possuiConsumoAplicado: jest.fn(),
      possuiConsumoAplicadoNaRodada: jest.fn(),
    };

    const retomadaInventario = {
      retomarAposResolucaoInventario: jest.fn(),
    };
    const useCase = new AjustarEstoqueDivergenciaUseCase(
      gateway,
      uow,
      retomadaInventario,
    );
    const executar = () =>
      useCase.execute({
        pendenciaId: 'pend',
        pecaId: 'p1',
        quantidadeFisicaNova: 10,
        motivo: 'Contagem física',
        responsavelId: 'admin',
      });
    return { gateway, retomadaInventario, executar };
  };

  it('delega ajuste administrativo no gateway e retoma a saga com a pendência resolvida', async () => {
    const { gateway, retomadaInventario, executar } = montar(true);
    await executar();

    expect(gateway.ajustarFisicoAdministrativo).toHaveBeenCalled();
    expect(
      retomadaInventario.retomarAposResolucaoInventario,
    ).toHaveBeenCalled();
  });

  it('não retoma a saga enquanto há peça divergente sem ajuste', async () => {
    const { gateway, retomadaInventario, executar } = montar(false);
    await executar();

    expect(gateway.ajustarFisicoAdministrativo).toHaveBeenCalled();
    expect(
      retomadaInventario.retomarAposResolucaoInventario,
    ).not.toHaveBeenCalled();
  });
});
