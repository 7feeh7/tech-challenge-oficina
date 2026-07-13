import { Servico } from '../../domain/entities/servico.entity';
import {
  NomeServicoJaExisteError,
  PrecoServicoInvalidoError,
} from '../../domain/errors/servico.errors';
import { CriarServicoUseCase } from './criar-servico.use-case';
import { criarGatewayMock } from './test-doubles';

describe('CriarServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: CriarServicoUseCase;

  const input = {
    nome: 'Troca de óleo',
    descricao: 'Troca de óleo do motor com filtro',
    precoBase: 150,
    tempoEstimadoMin: 60,
  };

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new CriarServicoUseCase(gateway);
    gateway.criar.mockImplementation((servico) => Promise.resolve(servico));
  });

  it('cria o serviço quando o nome está livre', async () => {
    gateway.existeComNome.mockResolvedValue(false);

    const result = await useCase.execute(input);

    expect(gateway.criar.mock.calls[0][0]).toBeInstanceOf(Servico);
    expect(result).toMatchObject({
      nome: 'Troca de óleo',
      precoBase: 150,
      ativo: true,
    });
  });

  it('checa a duplicidade com o nome já normalizado', async () => {
    gateway.existeComNome.mockResolvedValue(false);

    await useCase.execute({ ...input, nome: '  Troca   de óleo ' });

    expect(gateway.existeComNome).toHaveBeenCalledWith('Troca de óleo');
  });

  it('recusa serviço com nome já cadastrado', async () => {
    gateway.existeComNome.mockResolvedValue(true);

    await expect(useCase.execute(input)).rejects.toThrow(
      NomeServicoJaExisteError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa preço inválido antes de tocar no repositório', async () => {
    await expect(useCase.execute({ ...input, precoBase: 0 })).rejects.toThrow(
      PrecoServicoInvalidoError,
    );
    expect(gateway.existeComNome).not.toHaveBeenCalled();
    expect(gateway.criar).not.toHaveBeenCalled();
  });
});
