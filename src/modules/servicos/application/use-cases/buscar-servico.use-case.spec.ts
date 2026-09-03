import { ServicoNaoEncontradoError } from '../../domain/errors/servico.errors';
import { BuscarServicoUseCase } from './buscar-servico.use-case';
import { criarGatewayMock, criarServicoFake } from './test-doubles';

describe('BuscarServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: BuscarServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new BuscarServicoUseCase(gateway);
  });

  it('retorna o serviço pelo id', async () => {
    gateway.buscarPorId.mockResolvedValue(criarServicoFake());

    const result = await useCase.execute('uuid-s1');

    expect(gateway.buscarPorId).toHaveBeenCalledWith('uuid-s1');
    expect(result).toMatchObject({ id: 'uuid-s1', nome: 'Troca de óleo' });
  });

  it('falha quando o serviço não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      ServicoNaoEncontradoError,
    );
  });
});
