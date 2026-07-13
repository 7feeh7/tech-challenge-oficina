import { UsuarioNaoEncontradoError } from '../../domain/errors/usuario.errors';
import { BuscarUsuarioUseCase } from './buscar-usuario.use-case';
import { criarGatewayMock, criarUsuarioFake } from './test-doubles';

describe('BuscarUsuarioUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarUsuarioUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarUsuarioUseCase(gateway);
  });

  it('retorna o usuário sem expor o hash da senha', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());

    const result = await useCase.execute('uuid-u1');

    expect(result).toMatchObject({ id: 'uuid-u1', email: 'maria@oficina.com' });
    expect(result).not.toHaveProperty('senhaHash');
  });

  it('falha quando o usuário não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      UsuarioNaoEncontradoError,
    );
  });
});
