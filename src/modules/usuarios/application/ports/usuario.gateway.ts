import { Usuario } from '../../domain/entities/usuario.entity';

export interface PaginaUsuarios {
  usuarios: Usuario[];
  total: number;
}

export interface UsuarioGateway {
  buscarPorId(id: string): Promise<Usuario | null>;
  buscarPorEmail(email: string): Promise<Usuario | null>;
  emailPertenceAOutroUsuario(email: string, id: string): Promise<boolean>;
  listar(page: number, limit: number, search?: string): Promise<PaginaUsuarios>;
  criar(usuario: Usuario): Promise<Usuario>;
  atualizar(id: string, usuario: Usuario): Promise<Usuario>;
  remover(id: string): Promise<void>;
}
