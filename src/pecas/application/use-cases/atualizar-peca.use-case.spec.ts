import {
  CodigoPecaJaExisteError,
  PecaNaoEncontradaError,
  QuantidadeEstoqueInvalidaError,
} from '../../domain/errors/peca.errors';
import { AtualizarPecaUseCase } from './atualizar-peca.use-case';
import { criarGatewayMock, criarPecaFake } from './test-doubles';

describe('AtualizarPecaUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: AtualizarPecaUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new AtualizarPecaUseCase(gateway);
    gateway.atualizar.mockImplementation((_id, peca) => Promise.resolve(peca));
  });

  it('aplica as alterações pelos comportamentos da entidade', async () => {
    gateway.buscarPorId.mockResolvedValue(criarPecaFake());
    gateway.codigoPertenceAOutraPeca.mockResolvedValue(false);

    const result = await useCase.execute('uuid-p1', {
      nome: 'Filtro de óleo premium',
      precoUnitario: 45.5,
    });

    expect(result).toMatchObject({
      nome: 'Filtro de óleo premium',
      precoUnitario: 45.5,
    });
  });

  it('desativa a peça quando ativo é false', async () => {
    gateway.buscarPorId.mockResolvedValue(criarPecaFake());

    const result = await useCase.execute('uuid-p1', { ativo: false });

    expect(result.ativo).toBe(false);
  });

  it('falha quando a peça não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('inexistente', { precoUnitario: 10 }),
    ).rejects.toThrow(PecaNaoEncontradaError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('recusa código já usado por outra peça', async () => {
    gateway.buscarPorId.mockResolvedValue(criarPecaFake());
    gateway.codigoPertenceAOutraPeca.mockResolvedValue(true);

    await expect(
      useCase.execute('uuid-p1', { codigo: 'FLT-999' }),
    ).rejects.toThrow(CodigoPecaJaExisteError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('não checa duplicidade quando o código informado é o mesmo da peça', async () => {
    gateway.buscarPorId.mockResolvedValue(criarPecaFake());

    await useCase.execute('uuid-p1', { codigo: ' flt-001 ' });

    expect(gateway.codigoPertenceAOutraPeca).not.toHaveBeenCalled();
    expect(gateway.atualizar).toHaveBeenCalled();
  });

  it('não permite deixar o estoque negativo', async () => {
    gateway.buscarPorId.mockResolvedValue(criarPecaFake());

    await expect(
      useCase.execute('uuid-p1', { quantidadeEstoque: -1 }),
    ).rejects.toThrow(QuantidadeEstoqueInvalidaError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });
});
