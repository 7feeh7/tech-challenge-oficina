import {
  CodigoPecaInvalidoError,
  EstoqueMinimoInvalidoError,
  NomePecaInvalidoError,
  PrecoPecaInvalidoError,
  QuantidadeEstoqueInvalidaError,
} from '../errors/peca.errors';
import { Peca } from './peca.entity';

const props = {
  codigo: 'FLT-001',
  nome: 'Filtro de óleo',
  descricao: 'Filtro de óleo para motores 1.0 a 2.0',
  precoUnitario: 29.9,
  quantidadeEstoque: 10,
  estoqueMinimo: 2,
};

describe('Peca', () => {
  it('normaliza o código para caixa alta', () => {
    const peca = new Peca({ ...props, codigo: ' flt-001 ' });

    expect(peca.codigo).toBe('FLT-001');
  });

  it('nasce ativa e com estoque zerado por padrão', () => {
    const peca = new Peca({
      codigo: 'FLT-002',
      nome: 'Filtro de ar',
      precoUnitario: 19.9,
    });

    expect(peca.ativo).toBe(true);
    expect(peca.quantidadeEstoque).toBe(0);
    expect(peca.estoqueMinimo).toBe(0);
  });

  it('guarda descrição em branco como ausente', () => {
    const peca = new Peca({ ...props, descricao: '  ' });

    expect(peca.descricao).toBeNull();
  });

  it('não instancia peça com código curto demais', () => {
    expect(() => new Peca({ ...props, codigo: 'A' })).toThrow(
      CodigoPecaInvalidoError,
    );
  });

  it('não instancia peça com nome curto demais', () => {
    expect(() => new Peca({ ...props, nome: 'ab' })).toThrow(
      NomePecaInvalidoError,
    );
  });

  it('não instancia peça com preço zero ou negativo', () => {
    expect(() => new Peca({ ...props, precoUnitario: 0 })).toThrow(
      PrecoPecaInvalidoError,
    );
  });

  it('não instancia peça com estoque negativo', () => {
    expect(() => new Peca({ ...props, quantidadeEstoque: -1 })).toThrow(
      QuantidadeEstoqueInvalidaError,
    );
  });

  it('não instancia peça com estoque mínimo negativo', () => {
    expect(() => new Peca({ ...props, estoqueMinimo: -1 })).toThrow(
      EstoqueMinimoInvalidoError,
    );
  });

  it('sinaliza quando o estoque está abaixo do mínimo', () => {
    const emFalta = new Peca({
      ...props,
      quantidadeEstoque: 1,
      estoqueMinimo: 2,
    });
    const abastecida = new Peca({
      ...props,
      quantidadeEstoque: 2,
      estoqueMinimo: 2,
    });

    expect(emFalta.estoqueAbaixoDoMinimo()).toBe(true);
    expect(abastecida.estoqueAbaixoDoMinimo()).toBe(false);
  });

  it('desativa e reativa a peça', () => {
    const peca = new Peca(props);

    peca.desativar();
    expect(peca.ativo).toBe(false);

    peca.ativar();
    expect(peca.ativo).toBe(true);
  });

  it('não permite alterar a quantidade em estoque para um valor negativo', () => {
    const peca = new Peca(props);

    expect(() => peca.alterarQuantidadeEstoque(-5)).toThrow(
      QuantidadeEstoqueInvalidaError,
    );
    expect(peca.quantidadeEstoque).toBe(10);
  });
});
