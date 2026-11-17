import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { MudancaOrdemServicoUseCase } from './mudanca-ordem-servico.use-case';
import { criarDetalheFake, criarGatewayMock } from './test-doubles';

class TesteMudancaUseCase extends MudancaOrdemServicoUseCase {
  constructor(
    ordens: ReturnType<typeof criarGatewayMock>,
    unitOfWork: UnitOfWorkFake,
    transicoes: TransicaoOrdemServicoService,
  ) {
    super(ordens, unitOfWork, transicoes);
  }

  executarTeste() {
    return this.aplicarMudanca({
      ordemServicoId: 'uuid-os1',
      aplicar: () => undefined,
    });
  }
}

describe('MudancaOrdemServicoUseCase', () => {
  it('falha quando a OS some após o commit', async () => {
    const gateway = criarGatewayMock();
    gateway.buscarDetalhePorId.mockResolvedValue(null);
    const transicoes = {
      aplicar: jest.fn().mockResolvedValue({ mudouStatus: false }),
      registrarMetricasDaMudanca: jest.fn(),
    } as unknown as TransicaoOrdemServicoService;

    const useCase = new TesteMudancaUseCase(
      gateway,
      new UnitOfWorkFake(),
      transicoes,
    );

    await expect(useCase.executarTeste()).rejects.toThrow(
      OrdemServicoNaoEncontradaError,
    );
  });

  it('devolve detalhe após aplicar mudança', async () => {
    const gateway = criarGatewayMock();
    gateway.buscarDetalhePorId.mockResolvedValue(criarDetalheFake());
    const transicoes = {
      aplicar: jest.fn().mockResolvedValue({ mudouStatus: true }),
      registrarMetricasDaMudanca: jest.fn(),
    } as unknown as TransicaoOrdemServicoService;

    const useCase = new TesteMudancaUseCase(
      gateway,
      new UnitOfWorkFake(),
      transicoes,
    );

    await useCase.executarTeste();

    expect(transicoes.registrarMetricasDaMudanca).toHaveBeenCalled();
  });
});
