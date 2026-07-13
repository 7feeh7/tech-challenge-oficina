import { PerfilUsuario as PerfilPrisma } from '@/generated/prisma/enums';
import { Usuario } from '../../entities/usuario.entity';
import { PerfilUsuario } from '../../domain/perfil-usuario';

interface UsuarioPrisma {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  perfil: PerfilPrisma;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class PrismaUsuarioMapper {
  static toDomain(raw: UsuarioPrisma): Usuario {
    return new Usuario({ ...raw, perfil: raw.perfil as PerfilUsuario });
  }

  static toPersistence(usuario: Usuario) {
    return {
      nome: usuario.nome,
      email: usuario.email,
      senhaHash: usuario.senhaHash,
      perfil: usuario.perfil as PerfilPrisma,
      ativo: usuario.ativo,
    };
  }
}
