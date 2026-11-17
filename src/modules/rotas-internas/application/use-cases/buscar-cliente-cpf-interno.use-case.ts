import { ClienteGateway } from '@/modules/clientes/application/ports/cliente.gateway';
import { ClienteNaoEncontradoInternoError } from '../../domain/erros-internos';

export interface BuscarClienteCpfInternoOutput {
  id: string;
  ativo: boolean;
}

export class BuscarClienteCpfInternoUseCase {
  constructor(private readonly clientes: ClienteGateway) {}

  async execute(cpf: string): Promise<BuscarClienteCpfInternoOutput> {
    const cliente = await this.clientes.buscarPorCpf(cpf);
    if (!cliente) {
      throw new ClienteNaoEncontradoInternoError();
    }
    return { id: cliente.id!, ativo: cliente.ativo };
  }
}
