import { Cliente } from '../../domain/entities/cliente.entity';

/** Veículo na visão do cliente: o módulo de clientes só lê estes dados. */
export interface VeiculoDoCliente {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
}

export interface ClienteComVeiculos {
  cliente: Cliente;
  veiculos: VeiculoDoCliente[];
}

export interface PaginaClientes {
  clientes: Cliente[];
  total: number;
}

export interface DocumentoDeContato {
  email?: string;
  cpfCnpj?: string;
}

export interface ClienteGateway {
  buscarPorId(id: string): Promise<Cliente | null>;
  buscarComVeiculosPorId(id: string): Promise<ClienteComVeiculos | null>;
  existeComEmailOuDocumento(email: string, cpfCnpj: string): Promise<boolean>;
  contatoPertenceAOutroCliente(
    id: string,
    contato: DocumentoDeContato,
  ): Promise<boolean>;
  listar(page: number, limit: number, search?: string): Promise<PaginaClientes>;
  criar(cliente: Cliente): Promise<Cliente>;
  atualizar(id: string, cliente: Cliente): Promise<Cliente>;
  remover(id: string): Promise<void>;
}
