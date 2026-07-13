import { Veiculo } from '../../domain/entities/veiculo.entity';

export interface VeiculoPrisma {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  clienteId: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class PrismaVeiculoMapper {
  static toDomain(raw: VeiculoPrisma): Veiculo {
    return new Veiculo(raw);
  }

  static toPersistence(veiculo: Veiculo) {
    return {
      placa: veiculo.placa,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      ano: veiculo.ano,
      clienteId: veiculo.clienteId,
    };
  }
}
