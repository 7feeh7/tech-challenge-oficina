import { Servico, ServicoProps } from '../../domain/entities/servico.entity';
import { ServicoGateway } from '../ports/servico.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const criarServicoFake = (overrides: Partial<ServicoProps> = {}) =>
  new Servico({
    id: 'uuid-s1',
    nome: 'Troca de óleo',
    descricao: 'Troca de óleo do motor com filtro',
    precoBase: 150,
    tempoEstimadoMin: 60,
    ativo: true,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  });

export const criarGatewayMock = (): jest.Mocked<ServicoGateway> => ({
  buscarPorId: jest.fn(),
  existeComNome: jest.fn(),
  nomePertenceAOutroServico: jest.fn(),
  listar: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  remover: jest.fn(),
});
