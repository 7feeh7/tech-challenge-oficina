import { MovimentacaoEstoqueNaoEncontradaError } from '../../domain/errors/movimentacao-estoque.errors';
import { BuscarMovimentacaoUseCase } from './buscar-movimentacao.use-case';
import {
  criarGatewayMock,
  criarMovimentacaoComPecaFake,
  pecaFake,
} from './test-doubles';

describe('BuscarMovimentacaoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarMovimentacaoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarMovimentacaoUseCase(gateway);
  });

  it('retorna a movimentação com os dados da peça', async () => {
    gateway.buscarComPecaPorId.mockResolvedValue(
      criarMovimentacaoComPecaFake(),
    );

    const result = await useCase.execute('uuid-m1');

    expect(gateway.buscarComPecaPorId).toHaveBeenCalledWith('uuid-m1');
    expect(result).toMatchObject({ id: 'uuid-m1', peca: pecaFake });
  });

  it('falha quando a movimentação não existe', async () => {
    gateway.buscarComPecaPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      MovimentacaoEstoqueNaoEncontradaError,
    );
  });
});
