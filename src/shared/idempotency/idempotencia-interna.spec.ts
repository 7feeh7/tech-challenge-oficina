import { devePersistirResultadoIdempotente } from './idempotencia-interna';

describe('devePersistirResultadoIdempotente', () => {
  it('persiste 2xx', () => {
    expect(devePersistirResultadoIdempotente(200)).toBe(true);
    expect(devePersistirResultadoIdempotente(201)).toBe(true);
  });

  it('não persiste 4xx', () => {
    expect(devePersistirResultadoIdempotente(400)).toBe(false);
    expect(devePersistirResultadoIdempotente(409)).toBe(false);
  });
});
