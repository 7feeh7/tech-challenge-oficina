import { ClienteNaoEncontradoError } from '../../domain/errors/cliente.errors';
import { AlterarStatusClienteUseCase } from './alterar-status-cliente.use-case';
import { criarClienteFake, criarGatewayMock } from './test-doubles';

describe('AlterarStatusClienteUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: AlterarStatusClienteUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new AlterarStatusClienteUseCase(gateway);
  });

  it('falha quando cliente não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('id-inexistente', {
        ativo: false,
        alteradoPorId: 'admin',
      }),
    ).rejects.toThrow(ClienteNaoEncontradoError);
  });

  it('retorna cliente sem persistir quando status já é o solicitado', async () => {
    const cliente = criarClienteFake({ ativo: true });
    gateway.buscarPorId.mockResolvedValue(cliente);

    const result = await useCase.execute('uuid-1', {
      ativo: true,
      alteradoPorId: 'admin',
    });

    expect(result.ativo).toBe(true);
    expect(gateway.alterarStatusComAuditoria).not.toHaveBeenCalled();
  });

  it('altera status e grava auditoria quando há mudança', async () => {
    const cliente = criarClienteFake({ ativo: true });
    const inativo = criarClienteFake({ ativo: false });
    gateway.buscarPorId.mockResolvedValue(cliente);
    gateway.alterarStatusComAuditoria.mockResolvedValue(inativo);

    const result = await useCase.execute('uuid-1', {
      ativo: false,
      alteradoPorId: 'admin-1',
    });

    expect(gateway.alterarStatusComAuditoria).toHaveBeenCalledWith(
      'uuid-1',
      false,
      'admin-1',
    );
    expect(result.ativo).toBe(false);
  });
});
