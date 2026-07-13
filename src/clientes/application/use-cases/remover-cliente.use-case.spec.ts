import { ClienteNaoEncontradoError } from '../../domain/errors/cliente.errors';
import { RemoverClienteUseCase } from './remover-cliente.use-case';
import { criarClienteFake, criarGatewayMock } from './test-doubles';

describe('RemoverClienteUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RemoverClienteUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RemoverClienteUseCase(gateway);
  });

  it('remove um cliente existente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarClienteFake());

    const result = await useCase.execute('uuid-1');

    expect(gateway.remover).toHaveBeenCalledWith('uuid-1');
    expect(result.message).toContain('uuid-1');
  });

  it('falha quando o cliente não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      ClienteNaoEncontradoError,
    );
    expect(gateway.remover).not.toHaveBeenCalled();
  });
});
