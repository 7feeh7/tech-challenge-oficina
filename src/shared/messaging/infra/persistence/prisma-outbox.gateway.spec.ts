import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { DESTINO_FILA_BILLING } from '../../envelope';
import { PrismaOutboxGateway } from './prisma-outbox.gateway';

describe('PrismaOutboxGateway', () => {
  it('registra mensagem na outbox', async () => {
    const create = jest.fn();
    const cliente = { outboxMensagem: { create } };
    const prisma = { outboxMensagem: { create } };
    const gateway = new PrismaOutboxGateway(prisma as never);
    const contexto = new PrismaContextoTransacao(cliente as never);

    await gateway.registrar(contexto, {
      eventId: 'e1',
      eventType: 'os.teste.v1',
      envelope: {
        eventId: 'e1',
        eventType: 'os.teste.v1',
        version: 1,
        occurredAt: 't',
        source: 'os-service',
        correlationId: 'c1',
        causationId: null,
        ordemServicoId: 'os',
        rodada: 1,
        payload: {},
      },
      correlationId: 'c1',
      destino: DESTINO_FILA_BILLING,
    });

    expect(create).toHaveBeenCalled();
  });
});
