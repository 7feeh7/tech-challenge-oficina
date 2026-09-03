import {
  ClienteDaOrdemNaoEncontradoError,
  PecaDaOrdemNaoEncontradaError,
  ServicoDaOrdemNaoEncontradoError,
  VeiculoDaOrdemNaoEncontradoError,
  VeiculoNaoPertenceAoClienteError,
} from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import { CriarOrdemServicoUseCase } from './criar-ordem-servico.use-case';
import {
  criarCatalogoMock,
  criarDetalheFake,
  criarGatewayMock,
} from './test-doubles';

describe('CriarOrdemServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let catalogo: ReturnType<typeof criarCatalogoMock>;
  let useCase: CriarOrdemServicoUseCase;

  const input = { clienteId: 'uuid-c1', veiculoId: 'uuid-v1' };

  beforeEach(() => {
    gateway = criarGatewayMock();
    catalogo = criarCatalogoMock();
    useCase = new CriarOrdemServicoUseCase(gateway, catalogo);
    gateway.criar.mockImplementation((ordem) =>
      Promise.resolve({ ...criarDetalheFake(), ordem }),
    );
  });

  it('abre a OS como RECEBIDA e registra a primeira entrada do histórico', async () => {
    const result = await useCase.execute(input);

    expect(result.status).toBe(StatusOS.RECEBIDA);
    expect(gateway.criar).toHaveBeenCalledWith(expect.anything(), {
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
      observacao: 'OS criada',
    });
  });

  it('congela o preço vigente do catálogo nos itens da OS', async () => {
    catalogo.buscarPrecoDoServico.mockResolvedValue(200);
    catalogo.buscarPrecoDaPeca.mockResolvedValue(50);

    const result = await useCase.execute({
      ...input,
      servicos: [{ servicoId: 'uuid-s1', quantidade: 2 }],
      pecas: [{ pecaId: 'uuid-p1', quantidade: 3 }],
    });

    // 2 × 200 + 3 × 50
    expect(result.valorTotal).toBe(550);
  });

  it('assume quantidade 1 quando o serviço não a informa', async () => {
    catalogo.buscarPrecoDoServico.mockResolvedValue(150);

    const result = await useCase.execute({
      ...input,
      servicos: [{ servicoId: 'uuid-s1' }],
    });

    expect(result.valorTotal).toBe(150);
  });

  it('recusa OS de cliente inexistente', async () => {
    catalogo.clienteExiste.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(
      ClienteDaOrdemNaoEncontradoError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa OS de veículo inexistente', async () => {
    catalogo.buscarVeiculo.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(
      VeiculoDaOrdemNaoEncontradoError,
    );
  });

  it('recusa veículo que não pertence ao cliente informado', async () => {
    catalogo.buscarVeiculo.mockResolvedValue({
      id: 'uuid-v1',
      clienteId: 'outro-cliente',
    });

    await expect(useCase.execute(input)).rejects.toThrow(
      VeiculoNaoPertenceAoClienteError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa serviço inexistente no catálogo', async () => {
    catalogo.buscarPrecoDoServico.mockResolvedValue(null);

    await expect(
      useCase.execute({ ...input, servicos: [{ servicoId: 'fantasma' }] }),
    ).rejects.toThrow(ServicoDaOrdemNaoEncontradoError);
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa peça inexistente no catálogo', async () => {
    catalogo.buscarPrecoDaPeca.mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...input,
        pecas: [{ pecaId: 'fantasma', quantidade: 1 }],
      }),
    ).rejects.toThrow(PecaDaOrdemNaoEncontradaError);
  });
});
