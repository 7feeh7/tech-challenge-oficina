import {
  OrdemServicoNaoEncontradaError,
  TransicaoStatusInvalidaError,
} from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import { AtualizarOrdemServicoUseCase } from './atualizar-ordem-servico.use-case';
import {
  clienteFake,
  criarCatalogoMock,
  criarDetalheFake,
  criarGatewayMock,
  criarNotificadorMock,
  criarOrdemFake,
} from './test-doubles';

describe('AtualizarOrdemServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let catalogo: ReturnType<typeof criarCatalogoMock>;
  let notificador: ReturnType<typeof criarNotificadorMock>;
  let useCase: AtualizarOrdemServicoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    catalogo = criarCatalogoMock();
    notificador = criarNotificadorMock();
    useCase = new AtualizarOrdemServicoUseCase(gateway, catalogo, notificador);
    gateway.atualizar.mockImplementation((_id, ordem) =>
      Promise.resolve({ ...criarDetalheFake(), ordem }),
    );
  });

  it('grava o histórico quando o status muda', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrdemFake());

    await useCase.execute('uuid-os1', { status: StatusOS.EM_DIAGNOSTICO });

    expect(gateway.atualizar).toHaveBeenCalledWith(
      'uuid-os1',
      expect.anything(),
      {
        statusAnterior: StatusOS.RECEBIDA,
        statusNovo: StatusOS.EM_DIAGNOSTICO,
      },
    );
  });

  it('não grava histórico quando o status não muda', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrdemFake());

    await useCase.execute('uuid-os1', { diagnostico: 'Correia gasta' });

    expect(gateway.atualizar).toHaveBeenCalledWith(
      'uuid-os1',
      expect.anything(),
      undefined,
    );
  });

  it('recusa transição inválida e não persiste nada', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrdemFake());

    await expect(
      useCase.execute('uuid-os1', { status: StatusOS.FINALIZADA }),
    ).rejects.toThrow(TransicaoStatusInvalidaError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  it('falha quando a OS não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('inexistente', { diagnostico: 'x' }),
    ).rejects.toThrow(OrdemServicoNaoEncontradaError);
  });

  it('acrescenta novos itens com o preço vigente do catálogo', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrdemFake());
    catalogo.buscarPrecoDaPeca.mockResolvedValue(80);

    await useCase.execute('uuid-os1', {
      pecas: [{ pecaId: 'uuid-p1', quantidade: 2 }],
    });

    const ordemPersistida = gateway.atualizar.mock.calls[0][1];
    expect(ordemPersistida.pecasAdicionadas).toHaveLength(1);
    expect(ordemPersistida.valorTotal()).toBe(160);
  });

  describe('notificação de status', () => {
    it('avisa o cliente quando o status muda', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrdemFake());

      await useCase.execute('uuid-os1', { status: StatusOS.EM_DIAGNOSTICO });

      expect(notificador.notificarMudancaDeStatus).toHaveBeenCalledWith({
        destinatario: { nome: clienteFake.nome, email: clienteFake.email },
        numeroOS: 1,
        statusAnterior: StatusOS.RECEBIDA,
        statusNovo: StatusOS.EM_DIAGNOSTICO,
      });
    });

    it('não avisa o cliente quando só os dados mudam', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrdemFake());

      await useCase.execute('uuid-os1', { diagnostico: 'Correia gasta' });

      expect(notificador.notificarMudancaDeStatus).not.toHaveBeenCalled();
    });

    it('não avisa o cliente quando a transição é recusada', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrdemFake());

      await expect(
        useCase.execute('uuid-os1', { status: StatusOS.ENTREGUE }),
      ).rejects.toThrow(TransicaoStatusInvalidaError);
      expect(notificador.notificarMudancaDeStatus).not.toHaveBeenCalled();
    });
  });
});
