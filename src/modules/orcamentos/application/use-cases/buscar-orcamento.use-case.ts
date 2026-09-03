import { OrcamentoNaoEncontradoError } from '../../domain/errors/orcamento.errors';
import {
  OrcamentoOutput,
  OrcamentoOutputMapper,
} from '../mappers/orcamento-output.mapper';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

export class BuscarOrcamentoUseCase {
  constructor(private readonly orcamentos: OrcamentoGateway) {}

  async execute(id: string): Promise<OrcamentoOutput> {
    const orcamento = await this.orcamentos.buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoError(id);
    }

    return OrcamentoOutputMapper.toOutput(orcamento);
  }
}
