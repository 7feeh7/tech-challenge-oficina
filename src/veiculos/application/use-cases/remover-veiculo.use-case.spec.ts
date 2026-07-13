import { VeiculoNaoEncontradoError } from '../../domain/errors/veiculo.errors';
import { RemoverVeiculoUseCase } from './remover-veiculo.use-case';
import { criarGatewayMock, criarVeiculoFake } from './test-doubles';

describe('RemoverVeiculoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RemoverVeiculoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RemoverVeiculoUseCase(gateway);
  });

  it('remove um veículo existente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarVeiculoFake());

    const result = await useCase.execute('uuid-v1');

    expect(gateway.remover).toHaveBeenCalledWith('uuid-v1');
    expect(result.message).toContain('uuid-v1');
  });

  it('falha quando o veículo não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      VeiculoNaoEncontradoError,
    );
    expect(gateway.remover).not.toHaveBeenCalled();
  });
});
