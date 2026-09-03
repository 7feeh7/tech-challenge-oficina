import { CredenciaisInvalidasError } from '../../domain/errors/usuario.errors';
import { Usuario } from '../../domain/entities/usuario.entity';
import { SenhaHasher } from '../ports/senha-hasher';
import { UsuarioGateway } from '../ports/usuario.gateway';

export interface ValidarCredenciaisInput {
  email: string;
  senha: string;
}

export class ValidarCredenciaisUseCase {
  constructor(
    private readonly usuarios: UsuarioGateway,
    private readonly hasher: SenhaHasher,
  ) {}

  async execute(input: ValidarCredenciaisInput): Promise<Usuario> {
    const usuario = await this.usuarios.buscarPorEmail(input.email);
    if (!usuario || !usuario.ativo) {
      throw new CredenciaisInvalidasError();
    }

    const senhaConfere = await this.hasher.comparar(
      input.senha,
      usuario.senhaHash,
    );
    if (!senhaConfere) {
      throw new CredenciaisInvalidasError();
    }

    return usuario;
  }
}
