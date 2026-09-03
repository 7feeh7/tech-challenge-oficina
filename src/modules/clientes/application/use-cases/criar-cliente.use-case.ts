import { ClienteJaExisteError } from '../../domain/errors/cliente.errors';
import { Cliente } from '../../domain/entities/cliente.entity';
import {
  ClienteOutput,
  ClienteOutputMapper,
} from '../mappers/cliente-output.mapper';
import { ClienteGateway } from '../ports/cliente.gateway';

export interface CriarClienteInput {
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
}

export class CriarClienteUseCase {
  constructor(private readonly clientes: ClienteGateway) {}

  async execute(input: CriarClienteInput): Promise<ClienteOutput> {
    const cliente = new Cliente(input);

    const jaExiste = await this.clientes.existeComEmailOuDocumento(
      cliente.email,
      cliente.cpfCnpj,
    );
    if (jaExiste) {
      throw new ClienteJaExisteError();
    }

    return ClienteOutputMapper.toOutput(await this.clientes.criar(cliente));
  }
}
