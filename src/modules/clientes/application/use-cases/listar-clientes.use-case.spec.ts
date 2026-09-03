import { ListarClientesUseCase } from './listar-clientes.use-case';
import { criarClienteFake, criarGatewayMock } from './test-doubles';

describe('ListarClientesUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarClientesUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarClientesUseCase(gateway);
  });

  it('retorna lista paginada de clientes', async () => {
    gateway.listar.mockResolvedValue({
      clientes: [criarClienteFake()],
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

  it('calcula o total de páginas para a página 2', async () => {
    gateway.listar.mockResolvedValue({ clientes: [], total: 15 });

    const result = await useCase.execute(2, 10, 'João');

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, 'João');
    expect(result.meta).toMatchObject({ total: 15, page: 2, totalPages: 2 });
  });
});
