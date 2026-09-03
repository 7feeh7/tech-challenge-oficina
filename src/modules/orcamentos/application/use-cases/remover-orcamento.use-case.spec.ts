import { OrcamentoNaoEncontradoError } from '../../domain/errors/orcamento.errors';
import { RemoverOrcamentoUseCase } from './remover-orcamento.use-case';
import { criarGatewayMock, criarOrcamentoFake } from './test-doubles';

describe('RemoverOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RemoverOrcamentoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RemoverOrcamentoUseCase(gateway);
  });

  it('remove um orçamento existente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());

    const result = await useCase.execute('uuid-orc1');

    expect(gateway.remover).toHaveBeenCalledWith('uuid-orc1');
    expect(result.message).toContain('uuid-orc1');
  });

  it('falha quando o orçamento não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      OrcamentoNaoEncontradoError,
    );
    expect(gateway.remover).not.toHaveBeenCalled();
  });
});
