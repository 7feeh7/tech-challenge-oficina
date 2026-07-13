import { ListarOrcamentosUseCase } from './listar-orcamentos.use-case';
import { criarGatewayMock, criarOrcamentoFake } from './test-doubles';

describe('ListarOrcamentosUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarOrcamentosUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarOrcamentosUseCase(gateway);
  });

  it('retorna lista paginada de orçamentos', async () => {
    gateway.listar.mockResolvedValue({
      orcamentos: [criarOrcamentoFake()],
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

  it('repassa o filtro por OS e calcula o total de páginas', async () => {
    gateway.listar.mockResolvedValue({ orcamentos: [], total: 15 });

    const result = await useCase.execute(2, 10, 'uuid-os1');

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, 'uuid-os1');
    expect(result.meta).toMatchObject({ total: 15, page: 2, totalPages: 2 });
  });
});
