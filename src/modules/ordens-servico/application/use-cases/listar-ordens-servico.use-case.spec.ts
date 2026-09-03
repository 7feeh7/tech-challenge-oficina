import { StatusOS } from '../../domain/status-os';
import { ListarOrdensServicoUseCase } from './listar-ordens-servico.use-case';
import {
  clienteFake,
  criarGatewayMock,
  criarOrdemFake,
  veiculoFake,
} from './test-doubles';

describe('ListarOrdensServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarOrdensServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarOrdensServicoUseCase(gateway);
  });

  it('retorna lista paginada de OS', async () => {
    gateway.listar.mockResolvedValue({
      ordens: [
        { ordem: criarOrdemFake(), cliente: clienteFake, veiculo: veiculoFake },
      ],
      total: 1,
    });

    const result = await useCase.execute(1, 10);

    expect(gateway.listar).toHaveBeenCalledWith(1, 10, undefined);
    expect(result.data[0]).toMatchObject({
      id: 'uuid-os1',
      cliente: clienteFake,
    });
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('repassa o filtro por status e calcula o total de páginas', async () => {
    gateway.listar.mockResolvedValue({ ordens: [], total: 15 });

    const result = await useCase.execute(2, 10, StatusOS.EM_EXECUCAO);

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, StatusOS.EM_EXECUCAO);
    expect(result.meta).toMatchObject({ total: 15, page: 2, totalPages: 2 });
  });
});
