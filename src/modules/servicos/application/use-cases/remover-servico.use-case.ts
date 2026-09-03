import { ServicoNaoEncontradoError } from '../../domain/errors/servico.errors';
import { ServicoGateway } from '../ports/servico.gateway';

export class RemoverServicoUseCase {
  constructor(private readonly servicos: ServicoGateway) {}

  async execute(id: string): Promise<{ message: string }> {
    if (!(await this.servicos.buscarPorId(id))) {
      throw new ServicoNaoEncontradoError(id);
    }

    await this.servicos.remover(id);

    return { message: `Serviço "${id}" removido com sucesso.` };
  }
}
