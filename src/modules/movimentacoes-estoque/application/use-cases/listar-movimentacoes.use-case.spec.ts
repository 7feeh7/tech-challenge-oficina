import { ListarMovimentacoesUseCase } from './listar-movimentacoes.use-case';
import { criarGatewayMock, criarMovimentacaoComPecaFake } from './test-doubles';

describe('ListarMovimentacoesUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarMovimentacoesUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarMovimentacoesUseCase(gateway);
  });

  it('retorna lista paginada de movimentações', async () => {
    gateway.listar.mockResolvedValue({
      movimentacoes: [criarMovimentacaoComPecaFake()],
      total: 1,
    });

    const result = await useCase.execute(1, 10);

    expect(gateway.listar).toHaveBeenCalledWith(1, 10, undefined);
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('repassa o filtro por peça e calcula o total de páginas', async () => {
    gateway.listar.mockResolvedValue({ movimentacoes: [], total: 15 });

    const result = await useCase.execute(2, 10, 'uuid-p1');

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, 'uuid-p1');
    expect(result.meta).toMatchObject({ total: 15, page: 2, totalPages: 2 });
  });
});
