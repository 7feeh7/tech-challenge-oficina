import { UsuarioNaoEncontradoError } from '../../domain/errors/usuario.errors';
import {
  UsuarioOutput,
  UsuarioOutputMapper,
} from '../mappers/usuario-output.mapper';
import { UsuarioGateway } from '../ports/usuario.gateway';

export class BuscarUsuarioUseCase {
  constructor(private readonly usuarios: UsuarioGateway) {}
  async execute(id: string): Promise<UsuarioOutput> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario) throw new UsuarioNaoEncontradoError(id);
    return UsuarioOutputMapper.toOutput(usuario);
  }
}
