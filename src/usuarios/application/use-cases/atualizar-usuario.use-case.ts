import { PerfilUsuario } from '../../domain/perfil-usuario';
import {
  EmailUsuarioJaExisteError,
  UsuarioNaoEncontradoError,
} from '../../domain/errors/usuario.errors';
import {
  UsuarioOutput,
  UsuarioOutputMapper,
} from '../mappers/usuario-output.mapper';
import { SenhaHasher } from '../ports/senha-hasher';
import { UsuarioGateway } from '../ports/usuario.gateway';

export interface AtualizarUsuarioInput {
  nome?: string;
  email?: string;
  senha?: string;
  perfil?: PerfilUsuario;
}

export class AtualizarUsuarioUseCase {
  constructor(
    private readonly usuarios: UsuarioGateway,
    private readonly hasher: SenhaHasher,
  ) {}
  async execute(
    id: string,
    input: AtualizarUsuarioInput,
  ): Promise<UsuarioOutput> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario) throw new UsuarioNaoEncontradoError(id);
    if (input.email && input.email.trim().toLowerCase() !== usuario.email) {
      if (await this.usuarios.emailPertenceAOutroUsuario(input.email, id)) {
        throw new EmailUsuarioJaExisteError(
          'E-mail já está em uso por outro usuário.',
        );
      }
      usuario.alterarEmail(input.email);
    }
    if (input.nome !== undefined) usuario.alterarNome(input.nome);
    if (input.perfil !== undefined) usuario.alterarPerfil(input.perfil);
    if (input.senha !== undefined)
      usuario.alterarSenhaHash(await this.hasher.hash(input.senha));
    return UsuarioOutputMapper.toOutput(
      await this.usuarios.atualizar(id, usuario),
    );
  }
}
