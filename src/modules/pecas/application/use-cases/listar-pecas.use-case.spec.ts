import { ListarPecasUseCase } from './listar-pecas.use-case';
import { criarGatewayMock, criarPecaFake } from './test-doubles';

describe('ListarPecasUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarPecasUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarPecasUseCase(gateway);
  });

  it('retorna lista paginada de peças', async () => {
    gateway.listar.mockResolvedValue({ pecas: [criarPecaFake()], total: 1 });

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

  it('repassa o filtro de busca e calcula o total de páginas', async () => {
    gateway.listar.mockResolvedValue({ pecas: [], total: 15 });

    const result = await useCase.execute(2, 10, 'filtro');

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, 'filtro');
    expect(result.meta).toMatchObject({ total: 15, page: 2, totalPages: 2 });
  });
});
