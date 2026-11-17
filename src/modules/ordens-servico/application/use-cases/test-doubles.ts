import {
  OrdemServico,
  OrdemServicoProps,
} from '../../domain/entities/ordem-servico.entity';
import { CatalogoGateway } from '../ports/catalogo.gateway';
import {
  OrdemServicoDetalhe,
  OrdemServicoGateway,
} from '../ports/ordem-servico.gateway';

export const clienteFake = {
  id: 'uuid-c1',
  nome: 'João Silva',
  email: 'joao@email.com',
};
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
  sugestoes: [],
  orcamentos: [],
  historicoStatus: [],
});

export const criarGatewayMock = (): jest.Mocked<OrdemServicoGateway> => ({
  buscarPorId: jest.fn(),
  buscarDetalhePorId: jest.fn(),
  listar: jest.fn(),
  criar: jest.fn(),
  bloquearParaAtualizacao: jest.fn(),
  salvar: jest.fn(),
  buscarMarcosDeTempo: jest.fn(),
});

export const criarCatalogoMock = (): jest.Mocked<CatalogoGateway> => ({
  clienteExiste: jest.fn().mockResolvedValue(true),
  buscarVeiculo: jest
    .fn()
    .mockResolvedValue({ id: 'uuid-v1', clienteId: 'uuid-c1' }),
  servicoExiste: jest.fn().mockResolvedValue(true),
  pecaExiste: jest.fn().mockResolvedValue(true),
});
