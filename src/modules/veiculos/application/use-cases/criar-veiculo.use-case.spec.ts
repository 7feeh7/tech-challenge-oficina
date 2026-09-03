import { Veiculo } from '../../domain/entities/veiculo.entity';
import {
  ClienteDoVeiculoNaoEncontradoError,
  PlacaVeiculoInvalidaError,
  PlacaVeiculoJaExisteError,
} from '../../domain/errors/veiculo.errors';
import { CriarVeiculoUseCase } from './criar-veiculo.use-case';
import { criarClientesMock, criarGatewayMock } from './test-doubles';

describe('CriarVeiculoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let clientes: ReturnType<typeof criarClientesMock>;
  let useCase: CriarVeiculoUseCase;

  const input = {
    placa: 'ABC1D23',
    marca: 'Toyota',
    modelo: 'Corolla',
    ano: 2023,
    clienteId: 'uuid-c1',
  };

  beforeEach(() => {
    gateway = criarGatewayMock();
    clientes = criarClientesMock();
    useCase = new CriarVeiculoUseCase(gateway, clientes);
    gateway.criar.mockImplementation((veiculo) => Promise.resolve(veiculo));
  });

  it('cria o veículo quando o cliente existe e a placa está livre', async () => {
    gateway.existeComPlaca.mockResolvedValue(false);

    const result = await useCase.execute(input);

    expect(gateway.criar.mock.calls[0][0]).toBeInstanceOf(Veiculo);
    expect(result).toMatchObject({ placa: 'ABC1D23', clienteId: 'uuid-c1' });
  });

  it('checa a duplicidade com a placa já normalizada', async () => {
    gateway.existeComPlaca.mockResolvedValue(false);

    await useCase.execute({ ...input, placa: ' abc-1d23 ' });

    expect(gateway.existeComPlaca).toHaveBeenCalledWith('ABC1D23');
  });

  it('recusa veículo cujo cliente não existe', async () => {
    clientes.existe.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(
      ClienteDoVeiculoNaoEncontradoError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa placa já cadastrada', async () => {
    gateway.existeComPlaca.mockResolvedValue(true);

    await expect(useCase.execute(input)).rejects.toThrow(
      PlacaVeiculoJaExisteError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa placa inválida antes de tocar no repositório', async () => {
    await expect(useCase.execute({ ...input, placa: 'XX' })).rejects.toThrow(
      PlacaVeiculoInvalidaError,
    );
    expect(clientes.existe).not.toHaveBeenCalled();
    expect(gateway.criar).not.toHaveBeenCalled();
  });
});
