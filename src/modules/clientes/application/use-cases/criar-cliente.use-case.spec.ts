import {
  ClienteJaExisteError,
  CpfCnpjClienteInvalidoError,
} from '../../domain/errors/cliente.errors';
import { Cliente } from '../../domain/entities/cliente.entity';
import { CriarClienteUseCase } from './criar-cliente.use-case';
import { criarGatewayMock } from './test-doubles';

describe('CriarClienteUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: CriarClienteUseCase;

  const input = {
    nome: 'João Silva',
    cpfCnpj: '52998224725',
    email: 'joao@email.com',
    telefone: '11999999999',
  };

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new CriarClienteUseCase(gateway);
    gateway.criar.mockImplementation((cliente) => Promise.resolve(cliente));
  });

  it('cria o cliente e devolve os dados públicos', async () => {
    gateway.existeComEmailOuDocumento.mockResolvedValue(false);

    const result = await useCase.execute(input);

    expect(gateway.criar.mock.calls[0][0]).toBeInstanceOf(Cliente);
    expect(result).toMatchObject({
      nome: 'João Silva',
      email: 'joao@email.com',
      cpfCnpj: '52998224725',
    });
  });

  it('checa duplicidade com os valores já normalizados', async () => {
    gateway.existeComEmailOuDocumento.mockResolvedValue(false);

    await useCase.execute({
      ...input,
      email: 'JOAO@EMAIL.COM',
      cpfCnpj: '529.982.247-25',
    });

    expect(gateway.existeComEmailOuDocumento).toHaveBeenCalledWith(
      'joao@email.com',
      '52998224725',
    );
  });

  it('recusa cliente com e-mail ou documento já cadastrado', async () => {
    gateway.existeComEmailOuDocumento.mockResolvedValue(true);

    await expect(useCase.execute(input)).rejects.toThrow(ClienteJaExisteError);
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa CPF/CNPJ inválido antes de tocar no repositório', async () => {
    await expect(
      useCase.execute({ ...input, cpfCnpj: '11111111111' }),
    ).rejects.toThrow(CpfCnpjClienteInvalidoError);
    expect(gateway.existeComEmailOuDocumento).not.toHaveBeenCalled();
    expect(gateway.criar).not.toHaveBeenCalled();
  });
});
