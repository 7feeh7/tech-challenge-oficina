import { PecaNaoEncontradaError } from '../../domain/errors/peca.errors';
import { PecaOutput, PecaOutputMapper } from '../mappers/peca-output.mapper';
import { PecaGateway } from '../ports/peca.gateway';

export class BuscarPecaUseCase {
  constructor(private readonly pecas: PecaGateway) {}

  async execute(id: string): Promise<PecaOutput> {
    const peca = await this.pecas.buscarPorId(id);
    if (!peca) {
      throw new PecaNaoEncontradaError(id);
    }

    return PecaOutputMapper.toOutput(peca);
  }
}
