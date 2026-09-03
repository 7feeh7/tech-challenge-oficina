import { ListarServicosUseCase } from './listar-servicos.use-case';
import { criarGatewayMock, criarServicoFake } from './test-doubles';

describe('ListarServicosUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarServicosUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarServicosUseCase(gateway);
  });

  it('retorna lista paginada de serviços', async () => {
    gateway.listar.mockResolvedValue({
      servicos: [criarServicoFake()],
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

  it('repassa o filtro de busca e calcula o total de páginas', async () => {
    gateway.listar.mockResolvedValue({ servicos: [], total: 15 });

    const result = await useCase.execute(2, 10, 'óleo');

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, 'óleo');
    expect(result.meta).toMatchObject({ total: 15, page: 2, totalPages: 2 });
  });
});
