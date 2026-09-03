import { Cliente } from '../../domain/entities/cliente.entity';
import { ClienteComVeiculos, VeiculoDoCliente } from '../ports/cliente.gateway';

export interface ClienteOutput {
  id?: string;
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
}

export interface ClienteDetalheOutput extends ClienteOutput {
  veiculos: VeiculoDoCliente[];
}

export class ClienteOutputMapper {
  static toOutput(this: void, cliente: Cliente): ClienteOutput {
    return {
      id: cliente.id,
      nome: cliente.nome,
      cpfCnpj: cliente.cpfCnpj,
      email: cliente.email,
      telefone: cliente.telefone,
    };
  }

  static toDetalheOutput({
    cliente,
    veiculos,
  }: ClienteComVeiculos): ClienteDetalheOutput {
    return { ...ClienteOutputMapper.toOutput(cliente), veiculos };
  }
}
