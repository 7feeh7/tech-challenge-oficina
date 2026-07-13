import { ListarUsuariosUseCase } from './listar-usuarios.use-case';
import { criarGatewayMock, criarUsuarioFake } from './test-doubles';

describe('ListarUsuariosUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: ListarUsuariosUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new ListarUsuariosUseCase(gateway);
  });

  it('calcula a paginação e omite o hash da senha', async () => {
    gateway.listar.mockResolvedValue({
      usuarios: [criarUsuarioFake()],
      total: 15,
    });

    const result = await useCase.execute(2, 10, 'Maria');

    expect(gateway.listar).toHaveBeenCalledWith(2, 10, 'Maria');
    expect(result.meta).toEqual({
      total: 15,
      page: 2,
      limit: 10,
      totalPages: 2,
    });
    expect(result.data[0]).not.toHaveProperty('senhaHash');
  });

  it('usa primeira página com 10 itens por padrão', async () => {
    gateway.listar.mockResolvedValue({ usuarios: [], total: 0 });

    const result = await useCase.execute();

    expect(gateway.listar).toHaveBeenCalledWith(1, 10, undefined);
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
  });
});
