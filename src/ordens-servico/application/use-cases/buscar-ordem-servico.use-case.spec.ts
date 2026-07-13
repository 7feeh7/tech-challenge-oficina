import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { BuscarOrdemServicoUseCase } from './buscar-ordem-servico.use-case';
import { criarDetalheFake, criarGatewayMock } from './test-doubles';

describe('BuscarOrdemServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarOrdemServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarOrdemServicoUseCase(gateway);
  });

  it('retorna a OS com cliente, veículo e itens', async () => {
    gateway.buscarDetalhePorId.mockResolvedValue(criarDetalheFake());

    const result = await useCase.execute('uuid-os1');

    expect(gateway.buscarDetalhePorId).toHaveBeenCalledWith('uuid-os1');
    expect(result).toMatchObject({ id: 'uuid-os1', numero: 1 });
  });

  it('falha quando a OS não existe', async () => {
    gateway.buscarDetalhePorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      OrdemServicoNaoEncontradaError,
    );
  });
});
