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
});
