import {
  CpfCnpjClienteInvalidoError,
  EmailClienteInvalidoError,
  NomeClienteInvalidoError,
  TelefoneClienteInvalidoError,
} from '../errors/cliente.errors';
import { Cliente } from './cliente.entity';

const props = {
  nome: 'João Silva',
  cpfCnpj: '52998224725',
  email: 'joao@email.com',
  telefone: '11999999999',
};

describe('Cliente', () => {
  it('normaliza nome e e-mail ao instanciar', () => {
    const cliente = new Cliente({
      ...props,
      nome: '  João   Silva  ',
      email: ' JOAO@EMAIL.COM ',
    });

    expect(cliente.nome).toBe('João Silva');
    expect(cliente.email).toBe('joao@email.com');
  });

  it('guarda o CPF/CNPJ apenas com dígitos', () => {
    const cliente = new Cliente({ ...props, cpfCnpj: '529.982.247-25' });

    expect(cliente.cpfCnpj).toBe('52998224725');
  });

  it('aceita CNPJ válido', () => {
    const cliente = new Cliente({ ...props, cpfCnpj: '11222333000181' });

    expect(cliente.cpfCnpj).toBe('11222333000181');
  });

  it('não instancia cliente com nome vazio', () => {
    expect(() => new Cliente({ ...props, nome: '  ' })).toThrow(
      NomeClienteInvalidoError,
    );
  });

  it('não instancia cliente com e-mail inválido', () => {
    expect(() => new Cliente({ ...props, email: 'joao-arroba-email' })).toThrow(
      EmailClienteInvalidoError,
    );
  });

  it('não instancia cliente com CPF de dígito verificador errado', () => {
    expect(() => new Cliente({ ...props, cpfCnpj: '11111111111' })).toThrow(
      CpfCnpjClienteInvalidoError,
    );
  });

  it('não instancia cliente com telefone inválido', () => {
    expect(() => new Cliente({ ...props, telefone: '123' })).toThrow(
      TelefoneClienteInvalidoError,
    );
  });

  it('não permite alterar o nome para vazio', () => {
    const cliente = new Cliente(props);

    expect(() => cliente.alterarNome('')).toThrow(NomeClienteInvalidoError);
    expect(cliente.nome).toBe('João Silva');
  });

  it('normaliza o e-mail ao alterá-lo', () => {
    const cliente = new Cliente(props);

    cliente.alterarEmail(' NOVO@EMAIL.COM ');

    expect(cliente.email).toBe('novo@email.com');
  });
});
