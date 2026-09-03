import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import {
  OrdemServicoOutput,
  OrdemServicoOutputMapper,
} from '../mappers/ordem-servico-output.mapper';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';

export class BuscarOrdemServicoUseCase {
  constructor(private readonly ordens: OrdemServicoGateway) {}

  async execute(id: string): Promise<OrdemServicoOutput> {
    const detalhe = await this.ordens.buscarDetalhePorId(id);
    if (!detalhe) {
      throw new OrdemServicoNaoEncontradaError(id);
    }

    return OrdemServicoOutputMapper.toOutput(detalhe);
  }
}
