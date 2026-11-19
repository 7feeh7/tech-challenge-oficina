import { BadRequestException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { PendenciasOsController } from './pendencias-os.controller';

describe('PendenciasOsController', () => {
  const requisicao = { user: { sub: 'admin-1' } } as never;

  it('delega ao caso de uso com o responsável do token e a chave aparada', async () => {
    const resolver = { execute: jest.fn().mockResolvedValue(undefined) };
    const controller = new PendenciasOsController(resolver as never);

    await controller.resolver(
      'os-1',
      'pend-1',
      { motivo: 'Estorno conferido' },
      requisicao,
      '  chave-1 ',
    );

    expect(resolver.execute).toHaveBeenCalledWith({
      ordemServicoId: 'os-1',
      pendenciaId: 'pend-1',
      motivo: 'Estorno conferido',
      responsavelId: 'admin-1',
      idempotencyKey: 'chave-1',
    });
  });

  it.each([undefined, '', '   '])(
    'recusa Idempotency-Key ausente (%p) com 400',
    async (chave) => {
      const resolver = { execute: jest.fn() };
      const controller = new PendenciasOsController(resolver as never);

      await expect(
        controller.resolver(
          'os-1',
          'pend-1',
          { motivo: 'm' },
          requisicao,
          chave,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(resolver.execute).not.toHaveBeenCalled();
    },
  );

  it('responde 204', () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        PendenciasOsController.prototype.resolver,
      ),
    ).toBe(204);
  });
});
