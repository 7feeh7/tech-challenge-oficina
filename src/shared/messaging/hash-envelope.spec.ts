import { hashEnvelope } from './hash-envelope';

describe('hashEnvelope', () => {
  it('gera hash determinístico', () => {
    const a = hashEnvelope({ x: 1 });
    const b = hashEnvelope({ x: 1 });
    expect(a).toBe(b);
    expect(a).not.toBe(hashEnvelope({ x: 2 }));
  });
});
