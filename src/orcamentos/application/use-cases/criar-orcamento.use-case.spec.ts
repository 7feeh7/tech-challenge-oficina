import {
  OrdemDoOrcamentoNaoEncontradaError,
  ValorOrcamentoInvalidoError,
} from '../../domain/errors/orcamento.errors';
import { StatusOrcamento } from '../../domain/status-orcamento';
import { CriarOrcamentoUseCase } from './criar-orcamento.use-case';
import { criarGatewayMock } from './test-doubles';

describe('CriarOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: CriarOrcamentoUseCase;

  const input = { ordemServicoId: 'uuid-os1', valorTotal: 350 };

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new CriarOrcamentoUseCase(gateway);
    gateway.criarEEnviarParaAprovacao.mockImplementation((orcamento) =>
      Promise.resolve(orcamento),
    );
  });

  it('cria o orçamento aguardando aprovação', async () => {
    const result = await useCase.execute(input);

    expect(result).toMatchObject({
      ordemServicoId: 'uuid-os1',
      valorTotal: 350,
      status: StatusOrcamento.AGUARDANDO_APROVACAO,
    });
    expect(gateway.criarEEnviarParaAprovacao).toHaveBeenCalled();
  });

  it('falha quando a OS não existe', async () => {
    gateway.buscarOrdemComPecas.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(
      OrdemDoOrcamentoNaoEncontradaError,
    );
    expect(gateway.criarEEnviarParaAprovacao).not.toHaveBeenCalled();
  });

  it('recusa valor inválido', async () => {
    await expect(useCase.execute({ ...input, valorTotal: 0 })).rejects.toThrow(
      ValorOrcamentoInvalidoError,
    );
    expect(gateway.criarEEnviarParaAprovacao).not.toHaveBeenCalled();
  });
});
