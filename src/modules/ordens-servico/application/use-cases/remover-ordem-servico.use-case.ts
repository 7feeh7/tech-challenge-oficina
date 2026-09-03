import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';

export class RemoverOrdemServicoUseCase {
  constructor(private readonly ordens: OrdemServicoGateway) {}

  async execute(id: string): Promise<{ message: string }> {
    if (!(await this.ordens.buscarPorId(id))) {
      throw new OrdemServicoNaoEncontradaError(id);
    }

    await this.ordens.remover(id);

    return { message: `Ordem de serviço "${id}" removida com sucesso.` };
  }
}
