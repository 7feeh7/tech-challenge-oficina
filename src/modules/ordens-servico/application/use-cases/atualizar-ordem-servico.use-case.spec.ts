import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { PatchOrdemServicoNaoPermitidoError } from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { AtualizarOrdemServicoUseCase } from './atualizar-ordem-servico.use-case';
import {
  criarDetalheFake,
  criarGatewayMock,
  criarOrdemFake,
} from './test-doubles';

describe('AtualizarOrdemServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let transicoes: jest.Mocked<TransicaoOrdemServicoService>;
  let useCase: AtualizarOrdemServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    transicoes = {
      aplicar: jest.fn().mockImplementation((_ctx, input) => {
        const ordem = criarOrdemFake();
        input.aplicar(ordem, new Date());
        return Promise.resolve({
          bloqueada: {
            ordem,
            cliente: { id: 'uuid-c1', nome: 'João', email: 'joao@email.com' },
            veiculo: { placa: 'ABC1D23', modelo: 'Corolla' },
          },
          statusAnterior: StatusOS.RECEBIDA,
          statusNovo: StatusOS.RECEBIDA,
          mudouStatus: false,
        });
      }),
      registrarMetricasDaMudanca: jest.fn(),
    } as unknown as jest.Mocked<TransicaoOrdemServicoService>;
    useCase = new AtualizarOrdemServicoUseCase(
      gateway,
      new UnitOfWorkFake(),
      transicoes,
    );
    gateway.buscarDetalhePorId.mockResolvedValue(criarDetalheFake());
  });

  it('atualiza a descrição do problema em RECEBIDA', async () => {
    await useCase.execute('uuid-os1', {
      descricaoProblema: 'Barulho no freio',
    });

    expect(transicoes.aplicar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ordemServicoId: 'uuid-os1' }),
    );
  });

  it('não altera nada quando descrição não é enviada', async () => {
    await useCase.execute('uuid-os1', {});

    const aplicar = transicoes.aplicar.mock.calls[0][1];
    const ordem = criarOrdemFake();
    const antes = ordem.descricaoProblema;
    aplicar.aplicar(ordem, new Date());
    expect(ordem.descricaoProblema).toBe(antes);
  });

  it('propaga erro de domínio quando o PATCH não é permitido', async () => {
    transicoes.aplicar.mockImplementation((_ctx, input) => {
      const ordem = criarOrdemFake({ status: StatusOS.EM_EXECUCAO });
      input.aplicar(ordem, new Date());
      return Promise.reject(
        new PatchOrdemServicoNaoPermitidoError('bloqueado'),
      );
    });

    await expect(
      useCase.execute('uuid-os1', { descricaoProblema: 'Novo' }),
    ).rejects.toThrow(PatchOrdemServicoNaoPermitidoError);
  });
});
