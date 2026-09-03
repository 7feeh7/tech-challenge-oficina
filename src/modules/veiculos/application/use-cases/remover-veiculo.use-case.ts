import { VeiculoNaoEncontradoError } from '../../domain/errors/veiculo.errors';
import { VeiculoGateway } from '../ports/veiculo.gateway';

export class RemoverVeiculoUseCase {
  constructor(private readonly veiculos: VeiculoGateway) {}

  async execute(id: string): Promise<{ message: string }> {
    if (!(await this.veiculos.buscarPorId(id))) {
      throw new VeiculoNaoEncontradoError(id);
    }

    await this.veiculos.remover(id);

    return { message: `Veículo "${id}" removido com sucesso.` };
  }
}
