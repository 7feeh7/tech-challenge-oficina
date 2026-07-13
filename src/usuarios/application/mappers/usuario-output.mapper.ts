import { Usuario } from '../../domain/entities/usuario.entity';

export interface UsuarioOutput {
  id?: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
}

export class UsuarioOutputMapper {
  static toOutput(usuario: Usuario): UsuarioOutput {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
    };
  }
}
