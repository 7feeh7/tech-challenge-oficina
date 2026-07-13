import {
  OrdemServico,
  OrdemServicoProps,
} from '../../domain/entities/ordem-servico.entity';
import { CatalogoGateway } from '../ports/catalogo.gateway';
import {
  OrdemServicoDetalhe,
  OrdemServicoGateway,
} from '../ports/ordem-servico.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const clienteFake = { id: 'uuid-c1', nome: 'João Silva' };
export const veiculoFake = {
  id: 'uuid-v1',
  placa: 'ABC1D23',
  modelo: 'Corolla',
};

export const criarOrdemFake = (overrides: Partial<OrdemServicoProps> = {}) =>
  new OrdemServico({
    id: 'uuid-os1',
    numero: 1,
    clienteId: 'uuid-c1',
    veiculoId: 'uuid-v1',
    criadoEm: new Date(),
    ...overrides,
  });

export const criarDetalheFake = (
  overrides: Partial<OrdemServicoProps> = {},
): OrdemServicoDetalhe => ({
  ordem: criarOrdemFake(overrides),
  cliente: clienteFake,
  veiculo: veiculoFake,
  servicos: [],
  pecas: [],
  orcamentos: [],
  historicoStatus: [],
});

export const criarGatewayMock = (): jest.Mocked<OrdemServicoGateway> => ({
  buscarPorId: jest.fn(),
  buscarDetalhePorId: jest.fn(),
  listar: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  remover: jest.fn(),
  buscarMarcosDeTempo: jest.fn(),
});

export const criarCatalogoMock = (): jest.Mocked<CatalogoGateway> => ({
  clienteExiste: jest.fn().mockResolvedValue(true),
  buscarVeiculo: jest
    .fn()
    .mockResolvedValue({ id: 'uuid-v1', clienteId: 'uuid-c1' }),
  buscarPrecoDoServico: jest.fn().mockResolvedValue(150),
  buscarPrecoDaPeca: jest.fn().mockResolvedValue(29.9),
});
