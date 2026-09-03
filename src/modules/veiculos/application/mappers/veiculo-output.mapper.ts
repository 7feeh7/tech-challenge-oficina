import { Veiculo } from '../../domain/entities/veiculo.entity';
import { DonoDoVeiculo, VeiculoComCliente } from '../ports/veiculo.gateway';

export interface VeiculoOutput {
  id?: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  clienteId: string;
}

export interface VeiculoDetalheOutput extends VeiculoOutput {
  cliente: DonoDoVeiculo;
}

export class VeiculoOutputMapper {
  static toOutput(this: void, veiculo: Veiculo): VeiculoOutput {
    return {
      id: veiculo.id,
      placa: veiculo.placa,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      ano: veiculo.ano,
      clienteId: veiculo.clienteId,
    };
  }

  static toDetalheOutput({
    veiculo,
    cliente,
  }: VeiculoComCliente): VeiculoDetalheOutput {
    return { ...VeiculoOutputMapper.toOutput(veiculo), cliente };
  }
}
