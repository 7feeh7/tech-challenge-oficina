import { Usuario } from '../../entities/usuario.entity';
import { PerfilUsuario } from '../../domain/perfil-usuario';
import { EmailUsuarioJaExisteError } from '../../domain/usuario.errors';
import {
  UsuarioOutput,
  UsuarioOutputMapper,
} from '../mappers/usuario-output.mapper';
import { SenhaHasher } from '../ports/senha-hasher';
import { UsuarioGateway } from '../ports/usuario.gateway';

export interface CriarUsuarioInput {
  nome: string;
  email: string;
  senha: string;
  perfil: PerfilUsuario;
}

export class CriarUsuarioUseCase {
  constructor(
    private readonly usuarios: UsuarioGateway,
    private readonly hasher: SenhaHasher,
  ) {}

  async execute(input: CriarUsuarioInput): Promise<UsuarioOutput> {
    const usuarioExiste = await this.usuarios.buscarPorEmail(input.email);
    if (usuarioExiste) {
      throw new EmailUsuarioJaExisteError();
    }

    const senhaHash = await this.hasher.hash(input.senha);
    const usuario = new Usuario({ ...input, senhaHash });
    return UsuarioOutputMapper.toOutput(await this.usuarios.criar(usuario));
  }
}
