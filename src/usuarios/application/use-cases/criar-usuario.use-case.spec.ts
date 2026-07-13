import { PerfilUsuario } from '../../domain/perfil-usuario';
import {
  EmailUsuarioInvalidoError,
  EmailUsuarioJaExisteError,
  NomeUsuarioInvalidoError,
} from '../../domain/usuario.errors';
import { Usuario } from '../../entities/usuario.entity';
import { CriarUsuarioUseCase } from './criar-usuario.use-case';
import {
  criarGatewayMock,
  criarHasherMock,
  criarUsuarioFake,
} from './test-doubles';

describe('CriarUsuarioUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let hasher: ReturnType<typeof criarHasherMock>;
  let useCase: CriarUsuarioUseCase;

  const input = {
    nome: 'Maria Souza',
    email: 'maria@oficina.com',
    senha: 'senhaSegura123',
    perfil: PerfilUsuario.ATENDENTE,
  };

  beforeEach(() => {
    gateway = criarGatewayMock();
    hasher = criarHasherMock();
    useCase = new CriarUsuarioUseCase(gateway, hasher);
  });

  it('persiste a entidade com a senha hasheada e não expõe o hash na saída', async () => {
    gateway.buscarPorEmail.mockResolvedValue(null);
    gateway.criar.mockImplementation((usuario) => Promise.resolve(usuario));

    const result = await useCase.execute(input);

    expect(hasher.hash).toHaveBeenCalledWith('senhaSegura123');
    expect(gateway.criar.mock.calls[0][0]).toBeInstanceOf(Usuario);
    expect(gateway.criar.mock.calls[0][0].senhaHash).toBe('hash-fake');
    expect(result).not.toHaveProperty('senhaHash');
  });

  it('normaliza nome e e-mail antes de persistir', async () => {
    gateway.buscarPorEmail.mockResolvedValue(null);
    gateway.criar.mockImplementation((usuario) => Promise.resolve(usuario));

    const result = await useCase.execute({
      ...input,
      nome: '  Maria   Souza ',
      email: 'MARIA@OFICINA.COM',
    });

    expect(result).toMatchObject({
      nome: 'Maria Souza',
      email: 'maria@oficina.com',
    });
  });

  it('recusa e-mail já cadastrado', async () => {
    gateway.buscarPorEmail.mockResolvedValue(criarUsuarioFake());

    await expect(useCase.execute(input)).rejects.toThrow(
      EmailUsuarioJaExisteError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa nome inválido antes de tocar no repositório', async () => {
    gateway.buscarPorEmail.mockResolvedValue(null);

    await expect(useCase.execute({ ...input, nome: ' ' })).rejects.toThrow(
      NomeUsuarioInvalidoError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa e-mail malformado', async () => {
    gateway.buscarPorEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({ ...input, email: 'maria-arroba-oficina' }),
    ).rejects.toThrow(EmailUsuarioInvalidoError);
    expect(gateway.criar).not.toHaveBeenCalled();
  });
});
