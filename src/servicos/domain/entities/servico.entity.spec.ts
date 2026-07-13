import {
  NomeServicoInvalidoError,
  PrecoServicoInvalidoError,
  TempoEstimadoServicoInvalidoError,
} from '../errors/servico.errors';
import { Servico } from './servico.entity';

const props = {
  nome: 'Troca de óleo',
  descricao: 'Troca de óleo do motor com filtro',
  precoBase: 150,
  tempoEstimadoMin: 60,
};

describe('Servico', () => {
  it('normaliza o nome ao instanciar', () => {
    const servico = new Servico({ ...props, nome: '  Troca   de óleo  ' });

    expect(servico.nome).toBe('Troca de óleo');
  });

  it('nasce ativo por padrão', () => {
    expect(new Servico(props).ativo).toBe(true);
  });

  it('guarda descrição em branco como ausente', () => {
    const servico = new Servico({ ...props, descricao: '   ' });

    expect(servico.descricao).toBeNull();
  });

  it('não instancia serviço com nome curto demais', () => {
    expect(() => new Servico({ ...props, nome: 'ab' })).toThrow(
      NomeServicoInvalidoError,
    );
  });

  it('não instancia serviço com preço zero ou negativo', () => {
    expect(() => new Servico({ ...props, precoBase: 0 })).toThrow(
      PrecoServicoInvalidoError,
    );
    expect(() => new Servico({ ...props, precoBase: -10 })).toThrow(
      PrecoServicoInvalidoError,
    );
  });

  it('não instancia serviço com preço acima do limite da coluna', () => {
    expect(() => new Servico({ ...props, precoBase: 100_000_000 })).toThrow(
      PrecoServicoInvalidoError,
    );
  });

  it('não instancia serviço com tempo estimado fracionado ou nulo', () => {
    expect(() => new Servico({ ...props, tempoEstimadoMin: 1.5 })).toThrow(
      TempoEstimadoServicoInvalidoError,
    );
    expect(() => new Servico({ ...props, tempoEstimadoMin: 0 })).toThrow(
      TempoEstimadoServicoInvalidoError,
    );
  });

  it('desativa e reativa o serviço', () => {
    const servico = new Servico(props);

    servico.desativar();
    expect(servico.ativo).toBe(false);

    servico.ativar();
    expect(servico.ativo).toBe(true);
  });

  it('não permite alterar o preço para um valor inválido', () => {
    const servico = new Servico(props);

    expect(() => servico.alterarPrecoBase(-1)).toThrow(
      PrecoServicoInvalidoError,
    );
    expect(servico.precoBase).toBe(150);
  });
});
