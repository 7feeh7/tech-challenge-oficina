import { ClienteNaoEncontradoError } from '../../domain/errors/cliente.errors';
import {
  ClienteOutput,
  ClienteOutputMapper,
} from '../mappers/cliente-output.mapper';
import { ClienteGateway } from '../ports/cliente.gateway';

export interface AlterarStatusClienteInput {
  ativo: boolean;
  alteradoPorId: string;
}

export class AlterarStatusClienteUseCase {
  constructor(private readonly clientes: ClienteGateway) {}

  async execute(
    id: string,
    input: AlterarStatusClienteInput,
  ): Promise<ClienteOutput> {
    const cliente = await this.clientes.buscarPorId(id);
    if (!cliente) {
      throw new ClienteNaoEncontradoError(id);
    }

    if (cliente.ativo === input.ativo) {
      return ClienteOutputMapper.toOutput(cliente);
    }

    cliente.alterarStatus(input.ativo);

    return ClienteOutputMapper.toOutput(
      await this.clientes.alterarStatusComAuditoria(
        id,
        input.ativo,
        input.alteradoPorId,
      ),
    );
  }
}
