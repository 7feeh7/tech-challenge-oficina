import {
  OrcamentoOutput,
  OrcamentoOutputMapper,
} from '../mappers/orcamento-output.mapper';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

export interface ListaOrcamentosOutput {
  data: OrcamentoOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarOrcamentosUseCase {
  constructor(private readonly orcamentos: OrcamentoGateway) {}

  async execute(
    page = 1,
    limit = 10,
    ordemServicoId?: string,
  ): Promise<ListaOrcamentosOutput> {
    const resultado = await this.orcamentos.listar(page, limit, ordemServicoId);

    return {
      data: resultado.orcamentos.map(OrcamentoOutputMapper.toOutput),
      meta: {
        total: resultado.total,
        page,
        limit,
        totalPages: Math.ceil(resultado.total / limit),
      },
    };
  }
}
