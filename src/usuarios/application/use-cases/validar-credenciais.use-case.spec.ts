import { CredenciaisInvalidasError } from '../../domain/usuario.errors';
import { ValidarCredenciaisUseCase } from './validar-credenciais.use-case';
import {
  criarGatewayMock,
  criarHasherMock,
  criarUsuarioFake,
} from './test-doubles';

describe('ValidarCredenciaisUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let hasher: ReturnType<typeof criarHasherMock>;
  let useCase: ValidarCredenciaisUseCase;

  const credenciais = {
    email: 'maria@oficina.com',
    senha: 'senhaSegura123',
  };

  beforeEach(() => {
    gateway = criarGatewayMock();
    hasher = criarHasherMock();
    useCase = new ValidarCredenciaisUseCase(gateway, hasher);
  });

  it('retorna o usuário quando as credenciais conferem', async () => {
    gateway.buscarPorEmail.mockResolvedValue(criarUsuarioFake());
    hasher.comparar.mockResolvedValue(true);

    const usuario = await useCase.execute(credenciais);

    expect(hasher.comparar).toHaveBeenCalledWith('senhaSegura123', 'hash-fake');
    expect(usuario.email).toBe('maria@oficina.com');
  });

  it('rejeita e-mail não cadastrado', async () => {
    gateway.buscarPorEmail.mockResolvedValue(null);

    await expect(useCase.execute(credenciais)).rejects.toThrow(
      CredenciaisInvalidasError,
    );
    expect(hasher.comparar).not.toHaveBeenCalled();
  });

  it('rejeita usuário inativo sem sequer comparar a senha', async () => {
    gateway.buscarPorEmail.mockResolvedValue(
      criarUsuarioFake({ ativo: false }),
    );

    await expect(useCase.execute(credenciais)).rejects.toThrow(
      CredenciaisInvalidasError,
    );
    expect(hasher.comparar).not.toHaveBeenCalled();
  });

  it('rejeita senha incorreta', async () => {
    gateway.buscarPorEmail.mockResolvedValue(criarUsuarioFake());
    hasher.comparar.mockResolvedValue(false);

    await expect(useCase.execute(credenciais)).rejects.toThrow(
      CredenciaisInvalidasError,
    );
  });
});
