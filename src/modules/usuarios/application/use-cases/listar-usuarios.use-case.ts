import {
  UsuarioOutput,
  UsuarioOutputMapper,
} from '../mappers/usuario-output.mapper';
import { UsuarioGateway } from '../ports/usuario.gateway';

export interface ListaUsuariosOutput {
  data: UsuarioOutput[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListarUsuariosUseCase {
  constructor(private readonly usuarios: UsuarioGateway) {}
  async execute(
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<ListaUsuariosOutput> {
    const resultado = await this.usuarios.listar(page, limit, search);
    return {
      data: resultado.usuarios.map(UsuarioOutputMapper.toOutput),
      meta: {
        total: resultado.total,
        page,
        limit,
        totalPages: Math.ceil(resultado.total / limit),
      },
    };
  }
}
