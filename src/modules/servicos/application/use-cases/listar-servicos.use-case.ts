import {
  ServicoOutput,
  ServicoOutputMapper,
} from '../mappers/servico-output.mapper';
import { ServicoGateway } from '../ports/servico.gateway';

export interface ListaServicosOutput {
  data: ServicoOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarServicosUseCase {
  constructor(private readonly servicos: ServicoGateway) {}

  async execute(
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<ListaServicosOutput> {
    const { servicos, total } = await this.servicos.listar(page, limit, search);

    return {
      data: servicos.map(ServicoOutputMapper.toOutput),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
