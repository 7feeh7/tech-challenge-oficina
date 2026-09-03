import { VeiculoNaoEncontradoError } from '../../domain/errors/veiculo.errors';
import { BuscarVeiculoUseCase } from './buscar-veiculo.use-case';
import { criarGatewayMock, criarVeiculoFake } from './test-doubles';

describe('BuscarVeiculoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarVeiculoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarVeiculoUseCase(gateway);
  });

  it('retorna o veículo com os dados do dono', async () => {
    const cliente = { id: 'uuid-c1', nome: 'João Silva' };
    gateway.buscarComClientePorId.mockResolvedValue({
      veiculo: criarVeiculoFake(),
      cliente,
    });

    const result = await useCase.execute('uuid-v1');

    expect(gateway.buscarComClientePorId).toHaveBeenCalledWith('uuid-v1');
    expect(result).toMatchObject({ id: 'uuid-v1', cliente });
  });

  it('falha quando o veículo não existe', async () => {
    gateway.buscarComClientePorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      VeiculoNaoEncontradoError,
    );
  });
});
