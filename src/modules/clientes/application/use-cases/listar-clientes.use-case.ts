import {
  ClienteOutput,
  ClienteOutputMapper,
} from '../mappers/cliente-output.mapper';
import { ClienteGateway } from '../ports/cliente.gateway';

export interface ListaClientesOutput {
  data: ClienteOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarClientesUseCase {
  constructor(private readonly clientes: ClienteGateway) {}

  async execute(
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<ListaClientesOutput> {
    const { clientes, total } = await this.clientes.listar(page, limit, search);

    return {
      data: clientes.map(ClienteOutputMapper.toOutput),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
