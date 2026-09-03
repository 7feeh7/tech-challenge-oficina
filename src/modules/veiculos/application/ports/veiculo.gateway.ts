import { Veiculo } from '../../domain/entities/veiculo.entity';

/** Cliente na visão do veículo: o módulo só lê o necessário para exibir o dono. */
export interface DonoDoVeiculo {
  id: string;
  nome: string;
}

export interface VeiculoComCliente {
  veiculo: Veiculo;
  cliente: DonoDoVeiculo;
}

export interface PaginaVeiculos {
  veiculos: Veiculo[];
  total: number;
}

export interface VeiculoGateway {
  buscarPorId(id: string): Promise<Veiculo | null>;
  buscarComClientePorId(id: string): Promise<VeiculoComCliente | null>;
  existeComPlaca(placa: string): Promise<boolean>;
  placaPertenceAOutroVeiculo(id: string, placa: string): Promise<boolean>;
  listar(page: number, limit: number, search?: string): Promise<PaginaVeiculos>;
  criar(veiculo: Veiculo): Promise<Veiculo>;
  atualizar(id: string, veiculo: Veiculo): Promise<Veiculo>;
  remover(id: string): Promise<void>;
}
