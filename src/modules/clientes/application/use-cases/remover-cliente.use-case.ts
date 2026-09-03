import { ClienteNaoEncontradoError } from '../../domain/errors/cliente.errors';
import { ClienteGateway } from '../ports/cliente.gateway';

export class RemoverClienteUseCase {
  constructor(private readonly clientes: ClienteGateway) {}

  async execute(id: string): Promise<{ message: string }> {
    if (!(await this.clientes.buscarPorId(id))) {
      throw new ClienteNaoEncontradoError(id);
    }

    await this.clientes.remover(id);

    return { message: `Cliente "${id}" removido com sucesso.` };
  }
}
