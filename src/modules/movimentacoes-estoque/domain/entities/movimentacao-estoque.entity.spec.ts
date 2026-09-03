import {
  EstoqueInsuficienteError,
  QuantidadeMovimentacaoInvalidaError,
} from '../errors/movimentacao-estoque.errors';
import { TipoMovimentacaoEstoque } from '../tipo-movimentacao-estoque';
import { MovimentacaoEstoque } from './movimentacao-estoque.entity';

const props = {
  pecaId: 'uuid-p1',
  tipo: TipoMovimentacaoEstoque.ENTRADA,
  quantidade: 5,
};

describe('MovimentacaoEstoque', () => {
  it('soma ao saldo quando é entrada', () => {
    const entrada = new MovimentacaoEstoque(props);

    expect(entrada.saldoApos(10)).toBe(15);
  });

  it('subtrai do saldo quando é baixa', () => {
    const baixa = new MovimentacaoEstoque({
      ...props,
      tipo: TipoMovimentacaoEstoque.BAIXA,
    });

    expect(baixa.saldoApos(10)).toBe(5);
  });

  it('permite baixar exatamente todo o saldo disponível', () => {
    const baixa = new MovimentacaoEstoque({
      ...props,
      tipo: TipoMovimentacaoEstoque.BAIXA,
      quantidade: 10,
    });

    expect(baixa.saldoApos(10)).toBe(0);
  });

  it('recusa baixa maior que o saldo disponível', () => {
    const baixa = new MovimentacaoEstoque({
      ...props,
      tipo: TipoMovimentacaoEstoque.BAIXA,
      quantidade: 11,
    });

    expect(() => baixa.saldoApos(10)).toThrow(EstoqueInsuficienteError);
  });

  it('informa disponível e solicitado na mensagem de estoque insuficiente', () => {
    const baixa = new MovimentacaoEstoque({
      ...props,
      tipo: TipoMovimentacaoEstoque.BAIXA,
      quantidade: 11,
    });

    expect(() => baixa.saldoApos(10)).toThrow(
      'Estoque insuficiente. Disponível: 10, solicitado: 11.',
    );
  });

  it('não instancia movimentação com quantidade zero ou negativa', () => {
    expect(() => new MovimentacaoEstoque({ ...props, quantidade: 0 })).toThrow(
      QuantidadeMovimentacaoInvalidaError,
    );
    expect(() => new MovimentacaoEstoque({ ...props, quantidade: -1 })).toThrow(
      QuantidadeMovimentacaoInvalidaError,
    );
  });

  it('não instancia movimentação com quantidade fracionada', () => {
    expect(
      () => new MovimentacaoEstoque({ ...props, quantidade: 1.5 }),
    ).toThrow(QuantidadeMovimentacaoInvalidaError);
  });

  it('guarda observação em branco como ausente', () => {
    const movimentacao = new MovimentacaoEstoque({
      ...props,
      observacao: '  ',
    });

    expect(movimentacao.observacao).toBeNull();
  });
});
