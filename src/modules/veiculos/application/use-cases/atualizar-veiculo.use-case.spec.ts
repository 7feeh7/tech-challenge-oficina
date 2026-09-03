import {
  ClienteDoVeiculoNaoEncontradoError,
  PlacaVeiculoJaExisteError,
  VeiculoNaoEncontradoError,
} from '../../domain/errors/veiculo.errors';
import { AtualizarVeiculoUseCase } from './atualizar-veiculo.use-case';
import {
  criarClientesMock,
  criarGatewayMock,
  criarVeiculoFake,
} from './test-doubles';

describe('AtualizarVeiculoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let clientes: ReturnType<typeof criarClientesMock>;
  let useCase: AtualizarVeiculoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    clientes = criarClientesMock();
    useCase = new AtualizarVeiculoUseCase(gateway, clientes);
    gateway.atualizar.mockImplementation((_id, veiculo) =>
      Promise.resolve(veiculo),
    );
  });

  it('aplica as alterações pelos comportamentos da entidade', async () => {
    gateway.buscarPorId.mockResolvedValue(criarVeiculoFake());
    gateway.placaPertenceAOutroVeiculo.mockResolvedValue(false);

    const result = await useCase.execute('uuid-v1', {
      placa: 'XYZ9K88',
      modelo: 'Hilux',
    });

    expect(result).toMatchObject({ placa: 'XYZ9K88', modelo: 'Hilux' });
  });

  it('falha quando o veículo não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('inexistente', { modelo: 'Hilux' }),
    ).rejects.toThrow(VeiculoNaoEncontradoError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('recusa placa já usada por outro veículo', async () => {
    gateway.buscarPorId.mockResolvedValue(criarVeiculoFake());
    gateway.placaPertenceAOutroVeiculo.mockResolvedValue(true);

    await expect(
      useCase.execute('uuid-v1', { placa: 'XYZ9K88' }),
    ).rejects.toThrow(PlacaVeiculoJaExisteError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('não checa duplicidade quando a placa informada é a mesma do veículo', async () => {
    gateway.buscarPorId.mockResolvedValue(criarVeiculoFake());

    await useCase.execute('uuid-v1', { placa: 'abc-1d23' });

    expect(gateway.placaPertenceAOutroVeiculo).not.toHaveBeenCalled();
    expect(gateway.atualizar).toHaveBeenCalled();
  });

  it('recusa transferência para cliente inexistente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarVeiculoFake());
    clientes.existe.mockResolvedValue(false);

    await expect(
      useCase.execute('uuid-v1', { clienteId: 'uuid-c2' }),
    ).rejects.toThrow(ClienteDoVeiculoNaoEncontradoError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('não consulta o cliente quando o dono não muda', async () => {
    gateway.buscarPorId.mockResolvedValue(criarVeiculoFake());

    await useCase.execute('uuid-v1', { clienteId: 'uuid-c1' });

    expect(clientes.existe).not.toHaveBeenCalled();
  });
});
