import { PrismaPedidoEmitidoGateway } from './prisma-pedido-emitido.gateway';
import { TipoPedidoSaga } from '@/shared/generated/prisma/enums';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

describe('PrismaPedidoEmitidoGateway', () => {
  it('grava pedido emitido na transação', async () => {
    const create = jest.fn();
    const prisma = { pedidoEmitido: { create } };
    const gateway = new PrismaPedidoEmitidoGateway(prisma as never);
    await gateway.registrar({} as never, {
      ordemServicoId: 'os',
      rodada: 1,
      tipo: TipoPedidoSaga.INICIAR_REPARO,
      destino: 'execution-in',
      eventId: 'ev',
    });
    expect(create).toHaveBeenCalled();
  });

  it('detecta e conclui pedido emitido', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'p1' });
    const updateMany = jest.fn();
    const prisma = {
      pedidoEmitido: { findFirst, updateMany },
    };
    const gateway = new PrismaPedidoEmitidoGateway(prisma as never);
    const existe = await gateway.existeEmitido(
      {} as never,
      'os',
      1,
      TipoPedidoSaga.CANCELAR_TAREFA,
    );
    expect(existe).toBe(true);
    await gateway.marcarConcluidoPorTipo(
      {} as never,
      'os',
      1,
      TipoPedidoSaga.CANCELAR_TAREFA,
    );
    expect(updateMany).toHaveBeenCalled();
  });
});
