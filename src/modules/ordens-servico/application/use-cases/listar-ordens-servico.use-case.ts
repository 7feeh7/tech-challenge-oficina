import { StatusOS } from '../../domain/status-os';
import {
  OrdemServicoOutputMapper,
  OrdemServicoResumoOutput,
} from '../mappers/ordem-servico-output.mapper';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';

export interface ListaOrdensServicoOutput {
  data: OrdemServicoResumoOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarOrdensServicoUseCase {
  constructor(private readonly ordens: OrdemServicoGateway) {}

  async execute(
    page = 1,
    limit = 10,
    status?: StatusOS,
  ): Promise<ListaOrdensServicoOutput> {
    const resultado = await this.ordens.listar(page, limit, status);

    return {
      data: resultado.ordens.map(OrdemServicoOutputMapper.toResumo),
      meta: {
        total: resultado.total,
        page,
        limit,
        totalPages: Math.ceil(resultado.total / limit),
      },
    };
  }
}
