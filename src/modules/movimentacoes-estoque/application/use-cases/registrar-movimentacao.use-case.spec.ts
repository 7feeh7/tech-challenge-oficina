import {
  EstoqueInsuficienteError,
  PecaDaMovimentacaoNaoEncontradaError,
  QuantidadeMovimentacaoInvalidaError,
} from '../../domain/errors/movimentacao-estoque.errors';
import { TipoMovimentacaoEstoque } from '../../domain/tipo-movimentacao-estoque';
import { RegistrarMovimentacaoUseCase } from './registrar-movimentacao.use-case';
import {
  criarGatewayMock,
  criarMovimentacaoComPecaFake,
  pecaFake,
} from './test-doubles';

describe('RegistrarMovimentacaoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: RegistrarMovimentacaoUseCase;
  const unitOfWork = {
    executar: jest.fn(<T>(fn: (ctx: unknown) => Promise<T>) => fn({})),
  };

  const entrada = {
    pecaId: 'uuid-p1',
    tipo: TipoMovimentacaoEstoque.ENTRADA,
    quantidade: 5,
  };
  const baixa = { ...entrada, tipo: TipoMovimentacaoEstoque.BAIXA };

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new RegistrarMovimentacaoUseCase(gateway, unitOfWork);
    gateway.registrar.mockImplementation((_ctx, movimentacao) =>
      Promise.resolve({ movimentacao, peca: pecaFake }),
    );
  });

  it('registra a entrada somando ao saldo da peça', async () => {
    gateway.buscarSaldosDaPeca.mockResolvedValue({
      quantidadeFisica: 10,
      quantidadeReservada: 0,
      quantidadeDisponivel: 10,
    });

    const result = await useCase.execute(entrada);

    expect(gateway.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quantidade: 5 }),
    );
    expect(result).toMatchObject({
      tipo: TipoMovimentacaoEstoque.ENTRADA,
      quantidade: 5,
      peca: pecaFake,
    });
  });

  it('registra a baixa subtraindo do saldo da peça', async () => {
    gateway.buscarSaldosDaPeca.mockResolvedValue({
      quantidadeFisica: 10,
      quantidadeReservada: 0,
      quantidadeDisponivel: 10,
    });

    await useCase.execute(baixa);

    expect(gateway.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quantidade: 5, tipo: baixa.tipo }),
    );
  });

  it('recusa baixa maior que o saldo e não grava nada', async () => {
    gateway.buscarSaldosDaPeca.mockResolvedValue({
      quantidadeFisica: 3,
      quantidadeReservada: 0,
      quantidadeDisponivel: 3,
    });

    await expect(useCase.execute(baixa)).rejects.toThrow(
      EstoqueInsuficienteError,
    );
    expect(gateway.registrar).not.toHaveBeenCalled();
  });

  it('falha quando a peça não existe', async () => {
    gateway.buscarSaldosDaPeca.mockResolvedValue(null);

    await expect(useCase.execute(entrada)).rejects.toThrow(
      PecaDaMovimentacaoNaoEncontradaError,
    );
    expect(gateway.registrar).not.toHaveBeenCalled();
  });

  it('permite baixar todo o saldo, zerando o estoque', async () => {
    gateway.buscarSaldosDaPeca.mockResolvedValue({
      quantidadeFisica: 5,
      quantidadeReservada: 0,
      quantidadeDisponivel: 5,
    });

    await useCase.execute(baixa);

    expect(gateway.registrar).toHaveBeenCalled();
  });

  it('recusa quantidade inválida antes de consultar o saldo', async () => {
    await expect(
      useCase.execute({ ...entrada, quantidade: 0 }),
    ).rejects.toThrow(QuantidadeMovimentacaoInvalidaError);
    expect(gateway.buscarSaldosDaPeca).not.toHaveBeenCalled();
  });

  it('mantém o vínculo com a ordem de serviço quando informado', async () => {
    gateway.buscarSaldosDaPeca.mockResolvedValue({
      quantidadeFisica: 10,
      quantidadeReservada: 0,
      quantidadeDisponivel: 10,
    });

    const result = await useCase.execute({
      ...baixa,
      ordemServicoId: 'uuid-os1',
      observacao: 'Baixa por OS',
    });

    expect(result).toMatchObject({
      ordemServicoId: 'uuid-os1',
      observacao: 'Baixa por OS',
    });
  });

  it('devolve a movimentação já persistida com a peça', async () => {
    gateway.buscarSaldosDaPeca.mockResolvedValue({
      quantidadeFisica: 10,
      quantidadeReservada: 0,
      quantidadeDisponivel: 10,
    });
    gateway.registrar.mockResolvedValue(criarMovimentacaoComPecaFake());

    const result = await useCase.execute(entrada);

    expect(result).toMatchObject({ id: 'uuid-m1', pecaId: 'uuid-p1' });
  });
});
