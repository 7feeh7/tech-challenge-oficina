import {
  Orcamento,
  OrcamentoProps,
} from '../../domain/entities/orcamento.entity';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const criarOrcamentoFake = (overrides: Partial<OrcamentoProps> = {}) =>
  new Orcamento({
    id: 'uuid-orc1',
    ordemServicoId: 'uuid-os1',
    valorTotal: 350,
    criadoEm: new Date(),
    ...overrides,
  });

export const criarGatewayMock = (): jest.Mocked<OrcamentoGateway> => ({
  buscarPorId: jest.fn(),
  listar: jest.fn(),
  buscarOrdemComPecas: jest
    .fn()
    .mockResolvedValue({ id: 'uuid-os1', pecas: [] }),
  criarEEnviarParaAprovacao: jest.fn(),
  atualizar: jest.fn(),
  aprovarComBaixaDeEstoque: jest.fn(),
  remover: jest.fn(),
});
