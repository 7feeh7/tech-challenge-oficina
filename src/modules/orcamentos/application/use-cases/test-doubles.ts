import { NotificadorDeStatusGateway } from '@/modules/ordens-servico/application/ports/notificador-status.gateway';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  Orcamento,
  OrcamentoProps,
} from '../../domain/entities/orcamento.entity';
import {
  OrcamentoGateway,
  ResultadoDaDecisao,
  TransicaoDaOrdem,
} from '../ports/orcamento.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const clienteFake = { nome: 'João Silva', email: 'joao@email.com' };

export const criarOrcamentoFake = (overrides: Partial<OrcamentoProps> = {}) =>
  new Orcamento({
    id: 'uuid-orc1',
    ordemServicoId: 'uuid-os1',
    valorTotal: 350,
    criadoEm: new Date(),
    ...overrides,
  });

export const criarTransicaoFake = (
  statusAnterior: StatusOS,
  statusNovo: StatusOS,
): TransicaoDaOrdem => ({
  ordemServicoId: 'uuid-os1',
  numeroOS: 42,
  cliente: clienteFake,
  statusAnterior,
  statusNovo,
});

/** A OS mudou de status: o gateway devolve o orçamento e a transição. */
export const comTransicao = (
  orcamento: Orcamento,
  statusAnterior: StatusOS,
  statusNovo: StatusOS,
): ResultadoDaDecisao => ({
  orcamento,
  transicao: criarTransicaoFake(statusAnterior, statusNovo),
});

/** A OS não saiu do lugar: nada a notificar. */
export const semTransicao = (orcamento: Orcamento): ResultadoDaDecisao => ({
  orcamento,
});

export const criarGatewayMock = (): jest.Mocked<OrcamentoGateway> => ({
  buscarPorId: jest.fn(),
  listar: jest.fn(),
  buscarOrdemComPecas: jest
    .fn()
    .mockResolvedValue({ id: 'uuid-os1', pecas: [] }),
  existeOrcamentoAguardandoAprovacao: jest.fn().mockResolvedValue(false),
  criarEEnviarParaAprovacao: jest.fn(),
  atualizar: jest.fn(),
  rejeitarEDevolverParaDiagnostico: jest.fn(),
  aprovarComBaixaDeEstoque: jest.fn(),
  remover: jest.fn(),
});

export const criarNotificadorMock =
  (): jest.Mocked<NotificadorDeStatusGateway> => ({
    notificarMudancaDeStatus: jest.fn().mockResolvedValue(undefined),
  });
