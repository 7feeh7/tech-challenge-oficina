import { Veiculo } from '../../domain/entities/veiculo.entity';
import {
  ClienteDoVeiculoNaoEncontradoError,
  PlacaVeiculoJaExisteError,
} from '../../domain/errors/veiculo.errors';
import {
  VeiculoOutput,
  VeiculoOutputMapper,
} from '../mappers/veiculo-output.mapper';
import { ClienteConsultaGateway } from '../ports/cliente-consulta.gateway';
import { VeiculoGateway } from '../ports/veiculo.gateway';

export interface CriarVeiculoInput {
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  clienteId: string;
}

export class CriarVeiculoUseCase {
  constructor(
    private readonly veiculos: VeiculoGateway,
    private readonly clientes: ClienteConsultaGateway,
  ) {}

  async execute(input: CriarVeiculoInput): Promise<VeiculoOutput> {
    const veiculo = new Veiculo(input);

    if (!(await this.clientes.existe(veiculo.clienteId))) {
      throw new ClienteDoVeiculoNaoEncontradoError(veiculo.clienteId);
    }

    if (await this.veiculos.existeComPlaca(veiculo.placa)) {
      throw new PlacaVeiculoJaExisteError();
    }

    return VeiculoOutputMapper.toOutput(await this.veiculos.criar(veiculo));
  }
}
