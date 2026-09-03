import { BcryptSenhaHasher } from './bcrypt-senha.hasher';

describe('BcryptSenhaHasher', () => {
  const hasher = new BcryptSenhaHasher();

  it('gera um hash diferente da senha em claro', async () => {
    const hash = await hasher.hash('senha-secreta');

    expect(hash).not.toBe('senha-secreta');
    expect(hash).toMatch(/^\$2[aby]\$/); // formato bcrypt
  });

  it('gera hashes distintos para a mesma senha (salt aleatório)', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('senha-secreta'),
      hasher.hash('senha-secreta'),
    ]);

    expect(a).not.toBe(b);
  });

  it('confirma a senha correta contra o hash', async () => {
    const hash = await hasher.hash('senha-secreta');

    await expect(hasher.comparar('senha-secreta', hash)).resolves.toBe(true);
  });

  it('rejeita a senha errada', async () => {
    const hash = await hasher.hash('senha-secreta');

    await expect(hasher.comparar('senha-errada', hash)).resolves.toBe(false);
  });
});
