import { OrcamentoNaoEncontradoError } from '../../domain/errors/orcamento.errors';
import { BuscarOrcamentoUseCase } from './buscar-orcamento.use-case';
import { criarGatewayMock, criarOrcamentoFake } from './test-doubles';

describe('BuscarOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarOrcamentoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarOrcamentoUseCase(gateway);
  });

  it('retorna o orçamento pelo id', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());

    const result = await useCase.execute('uuid-orc1');

    expect(gateway.buscarPorId).toHaveBeenCalledWith('uuid-orc1');
    expect(result).toMatchObject({ id: 'uuid-orc1', valorTotal: 350 });
  });

  it('falha quando o orçamento não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      OrcamentoNaoEncontradoError,
    );
  });
});
