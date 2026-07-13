import {
  AnoVeiculoInvalidoError,
  MarcaVeiculoInvalidaError,
  PlacaVeiculoInvalidaError,
} from '../errors/veiculo.errors';
import { Veiculo } from './veiculo.entity';

const props = {
  placa: 'ABC1D23',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2023,
  clienteId: 'uuid-c1',
};

describe('Veiculo', () => {
  it('normaliza a placa para caixa alta e sem separadores', () => {
    const veiculo = new Veiculo({ ...props, placa: ' abc-1d23 ' });

    expect(veiculo.placa).toBe('ABC1D23');
  });

  it('aceita placa no padrão antigo', () => {
    const veiculo = new Veiculo({ ...props, placa: 'ABC1234' });

    expect(veiculo.placa).toBe('ABC1234');
  });

  it('não instancia veículo com placa fora do formato', () => {
    expect(() => new Veiculo({ ...props, placa: 'A1' })).toThrow(
      PlacaVeiculoInvalidaError,
    );
  });

  it('não instancia veículo com marca vazia', () => {
    expect(() => new Veiculo({ ...props, marca: ' ' })).toThrow(
      MarcaVeiculoInvalidaError,
    );
  });

  it('não instancia veículo com ano anterior ao primeiro automóvel', () => {
    expect(() => new Veiculo({ ...props, ano: 1800 })).toThrow(
      AnoVeiculoInvalidoError,
    );
  });

  it('não instancia veículo com ano além do próximo', () => {
    const anoInvalido = Veiculo.anoMaximoPermitido() + 1;

    expect(() => new Veiculo({ ...props, ano: anoInvalido })).toThrow(
      AnoVeiculoInvalidoError,
    );
  });

  it('aceita o ano-modelo seguinte ao atual', () => {
    const veiculo = new Veiculo({
      ...props,
      ano: Veiculo.anoMaximoPermitido(),
    });

    expect(veiculo.ano).toBe(Veiculo.anoMaximoPermitido());
  });

  it('não permite alterar a placa para um valor inválido', () => {
    const veiculo = new Veiculo(props);

    expect(() => veiculo.alterarPlaca('XX')).toThrow(PlacaVeiculoInvalidaError);
    expect(veiculo.placa).toBe('ABC1D23');
  });

  it('transfere o veículo para outro cliente', () => {
    const veiculo = new Veiculo(props);

    veiculo.transferirParaCliente('uuid-c2');

    expect(veiculo.clienteId).toBe('uuid-c2');
  });
});
