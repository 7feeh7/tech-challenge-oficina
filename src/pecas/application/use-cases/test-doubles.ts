import { Peca, PecaProps } from '../../domain/entities/peca.entity';
import { PecaGateway } from '../ports/peca.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const criarPecaFake = (overrides: Partial<PecaProps> = {}) =>
  new Peca({
    id: 'uuid-p1',
    codigo: 'FLT-001',
    nome: 'Filtro de óleo',
    descricao: 'Filtro de óleo para motores 1.0 a 2.0',
    precoUnitario: 29.9,
    quantidadeEstoque: 10,
    estoqueMinimo: 2,
    ativo: true,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  });

export const criarGatewayMock = (): jest.Mocked<PecaGateway> => ({
  buscarPorId: jest.fn(),
  existeComCodigo: jest.fn(),
  codigoPertenceAOutraPeca: jest.fn(),
  listar: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  remover: jest.fn(),
});
