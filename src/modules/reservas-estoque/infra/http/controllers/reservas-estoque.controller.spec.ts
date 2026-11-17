import { BadRequestException } from '@nestjs/common';
import { ReservasEstoqueController } from './reservas-estoque.controller';
import { AjustarEstoqueDivergenciaUseCase } from '@/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';
import { ResolverConsumoManualUseCase } from '@/modules/reservas-estoque/application/use-cases/resolver-consumo-manual.use-case';

describe('ReservasEstoqueController', () => {
  it('registra ajuste com o responsável autenticado', async () => {
    const ajustar = {
      execute: jest.fn(),
    } as unknown as AjustarEstoqueDivergenciaUseCase;
    const resolver = {
      execute: jest.fn(),
    } as unknown as ResolverConsumoManualUseCase;
    const controller = new ReservasEstoqueController(ajustar, resolver);

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

  it('resolver consumo manual exige Idempotency-Key', async () => {
    const controller = new ReservasEstoqueController(
      { execute: jest.fn() } as never,
      { execute: jest.fn() } as never,
    );
    await expect(
      controller.resolverConsumoManualInicial(
        {
          pendenciaId: 'pend',
          itensConsumidos: [],
          itensLiberados: [],
          motivo: 'ok',
        },
        { user: { sub: 'admin-uuid' } } as never,
        '  ',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolver consumo manual usa sub autenticado e chave idempotente', async () => {
    const resolver = { execute: jest.fn() };
    const controller = new ReservasEstoqueController(
      { execute: jest.fn() } as never,
      resolver as never,
    );
    await controller.resolverConsumoManualInicial(
      {
        pendenciaId: 'pend',
        itensConsumidos: [{ pecaId: 'p1', quantidade: 1 }],
        itensLiberados: [],
        motivo: 'decisão',
      },
      { user: { sub: 'admin-uuid' } } as never,
      ' chave-idem ',
    );
    expect(resolver.execute).toHaveBeenCalledWith({
      pendenciaId: 'pend',
      itensConsumidos: [{ pecaId: 'p1', quantidade: 1 }],
      itensLiberados: [],
      motivo: 'decisão',
      responsavelId: 'admin-uuid',
      idempotencyKey: 'chave-idem',
    });
  });
});
