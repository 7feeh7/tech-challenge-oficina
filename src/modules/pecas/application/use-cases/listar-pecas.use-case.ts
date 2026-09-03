import { PecaOutput, PecaOutputMapper } from '../mappers/peca-output.mapper';
import { PecaGateway } from '../ports/peca.gateway';

export interface ListaPecasOutput {
  data: PecaOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarPecasUseCase {
  constructor(private readonly pecas: PecaGateway) {}

  async execute(
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<ListaPecasOutput> {
    const { pecas, total } = await this.pecas.listar(page, limit, search);

    return {
      data: pecas.map(PecaOutputMapper.toOutput),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
