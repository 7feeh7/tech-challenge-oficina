import { Cliente } from '../../domain/entities/cliente.entity';

export interface ClientePrisma {
  id: string;
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class PrismaClienteMapper {
  static toDomain(this: void, raw: ClientePrisma): Cliente {
    return new Cliente(raw);
  }

  static toPersistence(cliente: Cliente) {
    return {
      nome: cliente.nome,
      cpfCnpj: cliente.cpfCnpj,
      email: cliente.email,
      telefone: cliente.telefone,
    };
  }
}
