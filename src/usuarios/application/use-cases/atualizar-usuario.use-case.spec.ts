import { PerfilUsuario } from '../../domain/perfil-usuario';
import {
  EmailUsuarioJaExisteError,
  NomeUsuarioInvalidoError,
  UsuarioNaoEncontradoError,
} from '../../domain/usuario.errors';
import { AtualizarUsuarioUseCase } from './atualizar-usuario.use-case';
import {
  criarGatewayMock,
  criarHasherMock,
  criarUsuarioFake,
} from './test-doubles';

describe('AtualizarUsuarioUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let hasher: ReturnType<typeof criarHasherMock>;
  let useCase: AtualizarUsuarioUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    hasher = criarHasherMock();
    useCase = new AtualizarUsuarioUseCase(gateway, hasher);
    gateway.atualizar.mockImplementation((_id, usuario) =>
      Promise.resolve(usuario),
    );
  });

  it('aplica as alterações pelos comportamentos da entidade', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());

    const result = await useCase.execute('uuid-u1', {
      nome: 'Maria Atualizada',
      perfil: PerfilUsuario.MECANICO,
    });

    expect(result).toMatchObject({
      nome: 'Maria Atualizada',
      perfil: PerfilUsuario.MECANICO,
    });
  });

  it('hasheia a nova senha quando ela é informada', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());
    hasher.hash.mockResolvedValue('novo-hash');

    await useCase.execute('uuid-u1', { senha: 'novaSenha456' });

    expect(hasher.hash).toHaveBeenCalledWith('novaSenha456');
    expect(gateway.atualizar.mock.calls[0][1].senhaHash).toBe('novo-hash');
  });

  it('não hasheia senha quando ela não é informada', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());

    await useCase.execute('uuid-u1', { nome: 'Maria Atualizada' });

    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it('falha quando o usuário não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('inexistente', { nome: 'Nova' }),
    ).rejects.toThrow(UsuarioNaoEncontradoError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('recusa e-mail já usado por outro usuário', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());
    gateway.emailPertenceAOutroUsuario.mockResolvedValue(true);

    await expect(
      useCase.execute('uuid-u1', { email: 'outro@oficina.com' }),
    ).rejects.toThrow(EmailUsuarioJaExisteError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('não checa duplicidade quando o e-mail informado é o mesmo do usuário', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());

    await useCase.execute('uuid-u1', { email: ' MARIA@OFICINA.COM ' });

    expect(gateway.emailPertenceAOutroUsuario).not.toHaveBeenCalled();
  });

  it('não permite deixar o nome vazio', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());

    await expect(useCase.execute('uuid-u1', { nome: '' })).rejects.toThrow(
      NomeUsuarioInvalidoError,
    );
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });
});
