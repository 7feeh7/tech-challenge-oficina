import { ServicoNaoEncontradoError } from '../../domain/errors/servico.errors';
import { RemoverServicoUseCase } from './remover-servico.use-case';
import { criarGatewayMock, criarServicoFake } from './test-doubles';

describe('RemoverServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RemoverServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RemoverServicoUseCase(gateway);
  });

  it('remove um serviço existente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarServicoFake());

    const result = await useCase.execute('uuid-s1');

    expect(gateway.remover).toHaveBeenCalledWith('uuid-s1');
    expect(result.message).toContain('uuid-s1');
  });

  it('falha quando o serviço não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      ServicoNaoEncontradoError,
    );
    expect(gateway.remover).not.toHaveBeenCalled();
  });
});
