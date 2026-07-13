import { UsuarioNaoEncontradoError } from '../../domain/usuario.errors';
import { RemoverUsuarioUseCase } from './remover-usuario.use-case';
import { criarGatewayMock, criarUsuarioFake } from './test-doubles';

describe('RemoverUsuarioUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RemoverUsuarioUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RemoverUsuarioUseCase(gateway);
  });

  it('remove um usuário existente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarUsuarioFake());

    const result = await useCase.execute('uuid-u1');

    expect(gateway.remover).toHaveBeenCalledWith('uuid-u1');
    expect(result.message).toContain('uuid-u1');
  });

  it('falha quando o usuário não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      UsuarioNaoEncontradoError,
    );
    expect(gateway.remover).not.toHaveBeenCalled();
  });
});
