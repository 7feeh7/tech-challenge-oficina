import { ReservasEstoqueController } from './reservas-estoque.controller';
import { AjustarEstoqueDivergenciaUseCase } from '@/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';

describe('ReservasEstoqueController', () => {
  it('registra ajuste com o responsável autenticado', async () => {
    const ajustar = {
      execute: jest.fn(),
    } as unknown as AjustarEstoqueDivergenciaUseCase;
    const controller = new ReservasEstoqueController(ajustar);

    await controller.registrarAjusteDivergencia(
      {
        pendenciaId: 'pend',
        pecaId: 'peca',
        quantidadeFisicaNova: 8,
        motivo: 'Conferência',
      },
      { user: { sub: 'admin-1' } } as never,
    );

    expect(ajustar.execute).toHaveBeenCalledWith({
      pendenciaId: 'pend',
      pecaId: 'peca',
      quantidadeFisicaNova: 8,
      motivo: 'Conferência',
      responsavelId: 'admin-1',
    });
  });
});
