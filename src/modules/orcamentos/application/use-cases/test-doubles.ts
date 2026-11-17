import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  Orcamento,
  OrcamentoProps,
} from '../../domain/entities/orcamento.entity';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

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
  buscarOrdemParaOrcamento: jest.fn().mockResolvedValue({
    id: 'uuid-os1',
    status: StatusOS.EM_DIAGNOSTICO,
    rodadaVigente: 1,
    pecas: [],
  }),
  existeOrcamentoAguardandoAprovacao: jest.fn().mockResolvedValue(false),
  criar: jest.fn(),
  atualizar: jest.fn(),
  remover: jest.fn(),
});
