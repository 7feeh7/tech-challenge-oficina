import { PerfilUsuario } from '../../domain/perfil-usuario';
import { Usuario, UsuarioProps } from '../../entities/usuario.entity';
import { SenhaHasher } from '../ports/senha-hasher';
import { UsuarioGateway } from '../ports/usuario.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const criarUsuarioFake = (overrides: Partial<UsuarioProps> = {}) =>
  new Usuario({
    id: 'uuid-u1',
    nome: 'Maria Souza',
    email: 'maria@oficina.com',
    senhaHash: 'hash-fake',
    perfil: PerfilUsuario.ATENDENTE,
    ativo: true,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  });

export const criarGatewayMock = (): jest.Mocked<UsuarioGateway> => ({
  buscarPorId: jest.fn(),
  buscarPorEmail: jest.fn(),
  emailPertenceAOutroUsuario: jest.fn(),
  listar: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  remover: jest.fn(),
});

export const criarHasherMock = (): jest.Mocked<SenhaHasher> => ({
  hash: jest.fn().mockResolvedValue('hash-fake'),
  comparar: jest.fn().mockResolvedValue(true),
});
