import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { RemoverOrdemServicoUseCase } from './remover-ordem-servico.use-case';
import { criarGatewayMock, criarOrdemFake } from './test-doubles';

describe('RemoverOrdemServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RemoverOrdemServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RemoverOrdemServicoUseCase(gateway);
  });

  it('remove uma OS existente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrdemFake());

    const result = await useCase.execute('uuid-os1');

    expect(gateway.remover).toHaveBeenCalledWith('uuid-os1');
    expect(result.message).toContain('uuid-os1');
  });

  it('falha quando a OS não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      OrdemServicoNaoEncontradaError,
    );
    expect(gateway.remover).not.toHaveBeenCalled();
  });
});
