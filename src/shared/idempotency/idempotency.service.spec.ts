import { ConflictException } from '@nestjs/common';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { IdempotencyService } from './idempotency.service';

const prismaMock = {
  idempotencyRecord: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

describe('IdempotencyService', () => {
  const service = new IdempotencyService(prismaMock as never);

  beforeEach(() => jest.clearAllMocks());

  it('hashes corpo ausente como objeto vazio', () => {
    expect(service.hashRequest(undefined)).toBe(service.hashRequest({}));
  });

  it('hashes request body deterministically', () => {
    const a = service.hashRequest({ foo: 'bar' });
    const b = service.hashRequest({ foo: 'bar' });
    expect(a).toBe(b);
  });

  it('returns stored replay when key and hash match', async () => {
    prismaMock.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'abc',
      responseStatus: 201,
      responseBody: { id: '1' },
    });

    const replay = await service.findReplay('key-1', 'scope', 'abc');

    expect(replay).toEqual({ statusCode: 201, body: { id: '1' } });
  });

  it('returns null when key does not exist yet', async () => {
    prismaMock.idempotencyRecord.findUnique.mockResolvedValue(null);

    await expect(
      service.findReplay('ausente', 'scope', 'hash'),
    ).resolves.toBeNull();
  });

  it('persists response with expiration', async () => {
    prismaMock.idempotencyRecord.create.mockResolvedValue({});

    await service.store('k1', 'scope', 'hash', 201, { ok: true });

    expect(prismaMock.idempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'k1',
        responseStatus: 201,
        responseBody: { ok: true },
      }),
    });
  });

  it('não grava idempotência interna para 4xx na transação', async () => {
    const cliente = { idempotencyRecord: { create: jest.fn() } };
    const contexto = new PrismaContextoTransacao(cliente as never);

    await service.gravarNaTransacao(contexto, 'k1', 'interno', 'hash', 409, {
      codigo: 'X',
    });

    expect(cliente.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('grava idempotência interna 2xx na transação', async () => {
    const cliente = { idempotencyRecord: { create: jest.fn() } };
    const contexto = new PrismaContextoTransacao(cliente as never);

    await service.gravarNaTransacao(contexto, 'k1', 'interno', 'hash', 200, {
      ok: true,
    });

    expect(cliente.idempotencyRecord.create).toHaveBeenCalled();
  });

  it('throws conflict when key matches but body hash differs', async () => {
    prismaMock.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'other',
      responseStatus: 201,
      responseBody: { id: '1' },
    });

    await expect(
      service.findReplay('key-1', 'scope', 'abc'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
