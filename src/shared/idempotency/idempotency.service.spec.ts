import { ConflictException } from '@nestjs/common';
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
