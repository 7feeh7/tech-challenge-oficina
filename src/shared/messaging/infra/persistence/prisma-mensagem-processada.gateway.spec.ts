import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { PrismaMensagemProcessadaGateway } from './prisma-mensagem-processada.gateway';

describe('PrismaMensagemProcessadaGateway', () => {
  it('identifica e registra mensagens processadas', async () => {
    const store = new Map<string, string>();
    const cliente = {
      mensagemProcessada: {
        findUnique: jest.fn(({ where }: { where: { eventId: string } }) =>
          Promise.resolve(
            store.has(where.eventId)
              ? { hashConteudo: store.get(where.eventId) }
              : null,
          ),
        ),
        create: jest.fn(
          ({ data }: { data: { eventId: string; hashConteudo: string } }) => {
            store.set(data.eventId, data.hashConteudo);
            return Promise.resolve(data);
          },
        ),
      },
    };
    const prisma = { mensagemProcessada: cliente.mensagemProcessada };
    const gateway = new PrismaMensagemProcessadaGateway(prisma as never);
    const contexto = new PrismaContextoTransacao(cliente as never);

    expect(await gateway.jaProcessada(contexto, 'e1')).toBe(false);
    await gateway.registrar(contexto, 'e1', 'hash');
    expect(await gateway.jaProcessada(contexto, 'e1')).toBe(true);
    expect(await gateway.buscarHash(contexto, 'e1')).toBe('hash');
  });
});
