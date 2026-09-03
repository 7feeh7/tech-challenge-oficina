import {
  ClienteJaExisteError,
  ClienteNaoEncontradoError,
} from '../../domain/errors/cliente.errors';
import { Cliente } from '../../domain/entities/cliente.entity';
import {
  ClienteOutput,
  ClienteOutputMapper,
} from '../mappers/cliente-output.mapper';
import { ClienteGateway, DocumentoDeContato } from '../ports/cliente.gateway';

export interface AtualizarClienteInput {
  nome?: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
}

export class AtualizarClienteUseCase {
  constructor(private readonly clientes: ClienteGateway) {}

  async execute(
    id: string,
    input: AtualizarClienteInput,
  ): Promise<ClienteOutput> {
    const cliente = await this.clientes.buscarPorId(id);
    if (!cliente) {
      throw new ClienteNaoEncontradoError(id);
    }

    await this.garantirContatoDisponivel(id, cliente, input);

    if (input.nome !== undefined) cliente.alterarNome(input.nome);
    if (input.email !== undefined) cliente.alterarEmail(input.email);
    if (input.cpfCnpj !== undefined) cliente.alterarCpfCnpj(input.cpfCnpj);
    if (input.telefone !== undefined) cliente.alterarTelefone(input.telefone);

    return ClienteOutputMapper.toOutput(
      await this.clientes.atualizar(id, cliente),
    );
  }

  /** Só consulta o repositório pelos campos únicos que realmente mudaram. */
  private async garantirContatoDisponivel(
    id: string,
    cliente: Cliente,
    input: AtualizarClienteInput,
  ): Promise<void> {
    const contato: DocumentoDeContato = {};

    if (input.email !== undefined) {
      const email = Cliente.normalizarEmail(input.email);
      if (email !== cliente.email) contato.email = email;
    }

    if (input.cpfCnpj !== undefined) {
      const cpfCnpj = Cliente.normalizarCpfCnpj(input.cpfCnpj);
      if (cpfCnpj !== cliente.cpfCnpj) contato.cpfCnpj = cpfCnpj;
    }

    if (!contato.email && !contato.cpfCnpj) return;

    if (await this.clientes.contatoPertenceAOutroCliente(id, contato)) {
      throw new ClienteJaExisteError(
        'E-mail ou CPF/CNPJ já está em uso por outro cliente.',
      );
    }
  }
}
