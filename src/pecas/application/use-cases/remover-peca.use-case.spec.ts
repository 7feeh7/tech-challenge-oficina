import { PecaNaoEncontradaError } from '../../domain/errors/peca.errors';
import { RemoverPecaUseCase } from './remover-peca.use-case';
import { criarGatewayMock, criarPecaFake } from './test-doubles';

describe('RemoverPecaUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RemoverPecaUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RemoverPecaUseCase(gateway);
  });

  it('remove uma peça existente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarPecaFake());

    const result = await useCase.execute('uuid-p1');

    expect(gateway.remover).toHaveBeenCalledWith('uuid-p1');
    expect(result.message).toContain('uuid-p1');
  });

  it('falha quando a peça não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      PecaNaoEncontradaError,
    );
    expect(gateway.remover).not.toHaveBeenCalled();
  });
});
