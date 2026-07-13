import { Peca } from '../../domain/entities/peca.entity';
import {
  CodigoPecaJaExisteError,
  PrecoPecaInvalidoError,
} from '../../domain/errors/peca.errors';
import { CriarPecaUseCase } from './criar-peca.use-case';
import { criarGatewayMock } from './test-doubles';

describe('CriarPecaUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: CriarPecaUseCase;

  const input = {
    codigo: 'FLT-001',
    nome: 'Filtro de óleo',
    descricao: 'Filtro de óleo para motores 1.0 a 2.0',
    precoUnitario: 29.9,
    quantidadeEstoque: 10,
    estoqueMinimo: 2,
  };

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new CriarPecaUseCase(gateway);
    gateway.criar.mockImplementation((peca) => Promise.resolve(peca));
  });

  it('cria a peça quando o código está livre', async () => {
    gateway.existeComCodigo.mockResolvedValue(false);

    const result = await useCase.execute(input);

    expect(gateway.criar.mock.calls[0][0]).toBeInstanceOf(Peca);
    expect(result).toMatchObject({
      codigo: 'FLT-001',
      quantidadeEstoque: 10,
      ativo: true,
    });
  });

  it('checa a duplicidade com o código já normalizado', async () => {
    gateway.existeComCodigo.mockResolvedValue(false);

    await useCase.execute({ ...input, codigo: ' flt-001 ' });

    expect(gateway.existeComCodigo).toHaveBeenCalledWith('FLT-001');
  });

  it('recusa peça com código já cadastrado', async () => {
    gateway.existeComCodigo.mockResolvedValue(true);

    await expect(useCase.execute(input)).rejects.toThrow(
      CodigoPecaJaExisteError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa preço inválido antes de tocar no repositório', async () => {
    await expect(
      useCase.execute({ ...input, precoUnitario: 0 }),
    ).rejects.toThrow(PrecoPecaInvalidoError);
    expect(gateway.existeComCodigo).not.toHaveBeenCalled();
    expect(gateway.criar).not.toHaveBeenCalled();
  });
});
