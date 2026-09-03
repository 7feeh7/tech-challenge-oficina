import {
  VeiculoOutput,
  VeiculoOutputMapper,
} from '../mappers/veiculo-output.mapper';
import { VeiculoGateway } from '../ports/veiculo.gateway';

export interface ListaVeiculosOutput {
  data: VeiculoOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarVeiculosUseCase {
  constructor(private readonly veiculos: VeiculoGateway) {}

  async execute(
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<ListaVeiculosOutput> {
    const { veiculos, total } = await this.veiculos.listar(page, limit, search);

    return {
      data: veiculos.map(VeiculoOutputMapper.toOutput),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
