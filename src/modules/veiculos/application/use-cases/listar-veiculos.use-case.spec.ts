import { ListarVeiculosUseCase } from './listar-veiculos.use-case';
import { criarGatewayMock, criarVeiculoFake } from './test-doubles';

describe('ListarVeiculosUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarVeiculosUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarVeiculosUseCase(gateway);
  });

  it('retorna lista paginada de veículos', async () => {
    gateway.listar.mockResolvedValue({
      veiculos: [criarVeiculoFake()],
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
    gateway.listar.mockResolvedValue({ veiculos: [], total: 15 });

    const result = await useCase.execute(2, 10, 'Corolla');

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, 'Corolla');
    expect(result.meta).toMatchObject({ total: 15, page: 2, totalPages: 2 });
  });
});
