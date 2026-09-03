import {
  ClienteJaExisteError,
  ClienteNaoEncontradoError,
  NomeClienteInvalidoError,
} from '../../domain/errors/cliente.errors';
import { AtualizarClienteUseCase } from './atualizar-cliente.use-case';
import { criarClienteFake, criarGatewayMock } from './test-doubles';

describe('AtualizarClienteUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: AtualizarClienteUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new AtualizarClienteUseCase(gateway);
    gateway.atualizar.mockImplementation((_id, cliente) =>
      Promise.resolve(cliente),
    );
  });

  it('aplica as alterações pelos comportamentos da entidade', async () => {
    gateway.buscarPorId.mockResolvedValue(criarClienteFake());

    const result = await useCase.execute('uuid-1', {
      nome: 'João Atualizado',
      telefone: '11888887777',
    });

    expect(result).toMatchObject({
      nome: 'João Atualizado',
      telefone: '11888887777',
    });
  });

  it('falha quando o cliente não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('inexistente', { nome: 'Teste' }),
    ).rejects.toThrow(ClienteNaoEncontradoError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('recusa e-mail já usado por outro cliente', async () => {
    gateway.buscarPorId.mockResolvedValue(criarClienteFake());
    gateway.contatoPertenceAOutroCliente.mockResolvedValue(true);

    await expect(
      useCase.execute('uuid-1', { email: 'outro@email.com' }),
    ).rejects.toThrow(ClienteJaExisteError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('consulta a duplicidade apenas dos campos únicos que mudaram', async () => {
    gateway.buscarPorId.mockResolvedValue(criarClienteFake());
    gateway.contatoPertenceAOutroCliente.mockResolvedValue(false);

    await useCase.execute('uuid-1', {
      email: 'outro@email.com',
      cpfCnpj: '52998224725',
    });

    expect(gateway.contatoPertenceAOutroCliente).toHaveBeenCalledWith(
      'uuid-1',
      {
        email: 'outro@email.com',
      },
    );
  });

  it('não consulta duplicidade quando e-mail e documento não mudaram', async () => {
    gateway.buscarPorId.mockResolvedValue(criarClienteFake());

    await useCase.execute('uuid-1', {
      email: ' JOAO@EMAIL.COM ',
      cpfCnpj: '529.982.247-25',
      nome: 'João Atualizado',
    });

    expect(gateway.contatoPertenceAOutroCliente).not.toHaveBeenCalled();
    expect(gateway.atualizar).toHaveBeenCalled();
  });

  it('não permite deixar o nome vazio', async () => {
    gateway.buscarPorId.mockResolvedValue(criarClienteFake());

    await expect(useCase.execute('uuid-1', { nome: '' })).rejects.toThrow(
      NomeClienteInvalidoError,
    );
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });
});
