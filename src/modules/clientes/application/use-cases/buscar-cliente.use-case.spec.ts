import { ClienteNaoEncontradoError } from '../../domain/errors/cliente.errors';
import { BuscarClienteUseCase } from './buscar-cliente.use-case';
import { criarClienteFake, criarGatewayMock } from './test-doubles';

describe('BuscarClienteUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarClienteUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarClienteUseCase(gateway);
  });

  it('retorna o cliente com seus veículos', async () => {
    const veiculo = {
      id: 'uuid-v1',
      placa: 'ABC1D23',
      marca: 'Fiat',
      modelo: 'Uno',
      ano: 2020,
    };
    gateway.buscarComVeiculosPorId.mockResolvedValue({
      cliente: criarClienteFake(),
      veiculos: [veiculo],
    });

    const result = await useCase.execute('uuid-1');

    expect(gateway.buscarComVeiculosPorId).toHaveBeenCalledWith('uuid-1');
    expect(result).toMatchObject({ id: 'uuid-1', veiculos: [veiculo] });
  });

  it('falha quando o cliente não existe', async () => {
    gateway.buscarComVeiculosPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      ClienteNaoEncontradoError,
    );
  });
});
