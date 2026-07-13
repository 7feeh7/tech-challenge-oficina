import { UsuarioNaoEncontradoError } from '../../domain/usuario.errors';
import { UsuarioGateway } from '../ports/usuario.gateway';

export class RemoverUsuarioUseCase {
  constructor(private readonly usuarios: UsuarioGateway) {}
  async execute(id: string): Promise<{ message: string }> {
    if (!(await this.usuarios.buscarPorId(id)))
      throw new UsuarioNaoEncontradoError(id);
    await this.usuarios.remover(id);
    return { message: `Usuário "${id}" removido com sucesso.` };
  }
}
