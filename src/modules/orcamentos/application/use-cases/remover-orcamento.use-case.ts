import { OrcamentoNaoEncontradoError } from '../../domain/errors/orcamento.errors';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

export class RemoverOrcamentoUseCase {
  constructor(private readonly orcamentos: OrcamentoGateway) {}

  async execute(id: string): Promise<{ message: string }> {
    if (!(await this.orcamentos.buscarPorId(id))) {
      throw new OrcamentoNaoEncontradoError(id);
    }

    await this.orcamentos.remover(id);

    return { message: `Orçamento "${id}" removido com sucesso.` };
  }
}
