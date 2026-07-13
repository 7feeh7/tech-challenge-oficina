import { PecaNaoEncontradaError } from '../../domain/errors/peca.errors';
import { BuscarPecaUseCase } from './buscar-peca.use-case';
import { criarGatewayMock, criarPecaFake } from './test-doubles';

describe('BuscarPecaUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarPecaUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarPecaUseCase(gateway);
  });

  it('retorna a peça pelo id', async () => {
    gateway.buscarPorId.mockResolvedValue(criarPecaFake());

    const result = await useCase.execute('uuid-p1');

    expect(gateway.buscarPorId).toHaveBeenCalledWith('uuid-p1');
    expect(result).toMatchObject({ id: 'uuid-p1', codigo: 'FLT-001' });
  });

  it('falha quando a peça não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      PecaNaoEncontradaError,
    );
  });
});
