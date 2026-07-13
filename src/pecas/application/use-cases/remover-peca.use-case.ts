import { PecaNaoEncontradaError } from '../../domain/errors/peca.errors';
import { PecaGateway } from '../ports/peca.gateway';

export class RemoverPecaUseCase {
  constructor(private readonly pecas: PecaGateway) {}

  async execute(id: string): Promise<{ message: string }> {
    if (!(await this.pecas.buscarPorId(id))) {
      throw new PecaNaoEncontradaError(id);
    }

    await this.pecas.remover(id);

    return { message: `Peça "${id}" removida com sucesso.` };
  }
}
