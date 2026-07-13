import { PerfilUsuario } from '../domain/perfil-usuario';
import { NomeUsuarioInvalidoError } from '../domain/usuario.errors';
import { Usuario } from './usuario.entity';

const props = {
  nome: 'Maria Souza',
  email: 'maria@oficina.com',
  senhaHash: 'hash',
  perfil: PerfilUsuario.ATENDENTE,
};

describe('Usuario', () => {
  it('não instancia usuário com nome vazio', () => {
    expect(() => new Usuario({ ...props, nome: '  ' })).toThrow(
      NomeUsuarioInvalidoError,
    );
  });

  it('normaliza nome e e-mail ao instanciar', () => {
    const usuario = new Usuario({
      ...props,
      nome: '  Maria   Souza  ',
      email: ' MARIA@OFICINA.COM ',
    });
    expect(usuario.nome).toBe('Maria Souza');
    expect(usuario.email).toBe('maria@oficina.com');
  });

  it('não permite alterar o nome para vazio', () => {
    const usuario = new Usuario(props);
    expect(() => usuario.alterarNome('')).toThrow(NomeUsuarioInvalidoError);
    expect(usuario.nome).toBe('Maria Souza');
  });
});
