import {
  NomeServicoJaExisteError,
  ServicoNaoEncontradoError,
} from '../../domain/errors/servico.errors';
import { AtualizarServicoUseCase } from './atualizar-servico.use-case';
import { criarGatewayMock, criarServicoFake } from './test-doubles';

describe('AtualizarServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: AtualizarServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new AtualizarServicoUseCase(gateway);
    gateway.atualizar.mockImplementation((_id, servico) =>
      Promise.resolve(servico),
    );
  });

  it('aplica as alterações pelos comportamentos da entidade', async () => {
    gateway.buscarPorId.mockResolvedValue(criarServicoFake());
    gateway.nomePertenceAOutroServico.mockResolvedValue(false);

    const result = await useCase.execute('uuid-s1', {
      nome: 'Troca de óleo sintético',
      precoBase: 220.5,
    });

    expect(result).toMatchObject({
      nome: 'Troca de óleo sintético',
      precoBase: 220.5,
    });
  });

  it('desativa o serviço quando ativo é false', async () => {
    gateway.buscarPorId.mockResolvedValue(criarServicoFake());

    const result = await useCase.execute('uuid-s1', { ativo: false });

    expect(result.ativo).toBe(false);
  });

  it('falha quando o serviço não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('inexistente', { precoBase: 100 }),
    ).rejects.toThrow(ServicoNaoEncontradoError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('recusa nome já usado por outro serviço', async () => {
    gateway.buscarPorId.mockResolvedValue(criarServicoFake());
    gateway.nomePertenceAOutroServico.mockResolvedValue(true);

    await expect(
      useCase.execute('uuid-s1', { nome: 'Alinhamento' }),
    ).rejects.toThrow(NomeServicoJaExisteError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('não checa duplicidade quando o nome informado é o mesmo do serviço', async () => {
    gateway.buscarPorId.mockResolvedValue(criarServicoFake());

    await useCase.execute('uuid-s1', { nome: '  Troca de óleo  ' });

    expect(gateway.nomePertenceAOutroServico).not.toHaveBeenCalled();
    expect(gateway.atualizar).toHaveBeenCalled();
  });
});
