import { ClienteNaoEncontradoError } from '../../domain/errors/cliente.errors';
import {
  ClienteDetalheOutput,
  ClienteOutputMapper,
} from '../mappers/cliente-output.mapper';
import { ClienteGateway } from '../ports/cliente.gateway';

export class BuscarClienteUseCase {
  constructor(private readonly clientes: ClienteGateway) {}

  async execute(id: string): Promise<ClienteDetalheOutput> {
    const detalhe = await this.clientes.buscarComVeiculosPorId(id);
    if (!detalhe) {
      throw new ClienteNaoEncontradoError(id);
    }

    return ClienteOutputMapper.toDetalheOutput(detalhe);
  }
}
