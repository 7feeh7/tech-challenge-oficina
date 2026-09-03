import { Cliente, ClienteProps } from '../../domain/entities/cliente.entity';
import { ClienteGateway } from '../ports/cliente.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const criarClienteFake = (overrides: Partial<ClienteProps> = {}) =>
  new Cliente({
    id: 'uuid-1',
    nome: 'João Silva',
    cpfCnpj: '52998224725',
    email: 'joao@email.com',
    telefone: '11999999999',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  });

export const criarGatewayMock = (): jest.Mocked<ClienteGateway> => ({
  buscarPorId: jest.fn(),
  buscarComVeiculosPorId: jest.fn(),
  existeComEmailOuDocumento: jest.fn(),
  contatoPertenceAOutroCliente: jest.fn(),
  listar: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  remover: jest.fn(),
});
