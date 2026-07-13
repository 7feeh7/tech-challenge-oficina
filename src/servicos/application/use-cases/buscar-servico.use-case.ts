import { ServicoNaoEncontradoError } from '../../domain/errors/servico.errors';
import {
  ServicoOutput,
  ServicoOutputMapper,
} from '../mappers/servico-output.mapper';
import { ServicoGateway } from '../ports/servico.gateway';

export class BuscarServicoUseCase {
  constructor(private readonly servicos: ServicoGateway) {}

  async execute(id: string): Promise<ServicoOutput> {
    const servico = await this.servicos.buscarPorId(id);
    if (!servico) {
      throw new ServicoNaoEncontradoError(id);
    }

    return ServicoOutputMapper.toOutput(servico);
  }
}
