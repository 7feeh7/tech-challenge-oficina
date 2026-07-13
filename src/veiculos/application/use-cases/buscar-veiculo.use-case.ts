import { VeiculoNaoEncontradoError } from '../../domain/errors/veiculo.errors';
import {
  VeiculoDetalheOutput,
  VeiculoOutputMapper,
} from '../mappers/veiculo-output.mapper';
import { VeiculoGateway } from '../ports/veiculo.gateway';

export class BuscarVeiculoUseCase {
  constructor(private readonly veiculos: VeiculoGateway) {}

  async execute(id: string): Promise<VeiculoDetalheOutput> {
    const detalhe = await this.veiculos.buscarComClientePorId(id);
    if (!detalhe) {
      throw new VeiculoNaoEncontradoError(id);
    }

    return VeiculoOutputMapper.toDetalheOutput(detalhe);
  }
}
