import { StatusOS } from '@/ordens-servico/domain/status-os';
import {
  OrcamentoEmAbertoError,
  OrdemDoOrcamentoNaoEncontradaError,
  ValorOrcamentoInvalidoError,
} from '../../domain/errors/orcamento.errors';
import { StatusOrcamento } from '../../domain/status-orcamento';
import { CriarOrcamentoUseCase } from './criar-orcamento.use-case';
import {
  clienteFake,
  comTransicao,
  criarGatewayMock,
  criarNotificadorMock,
  semTransicao,
} from './test-doubles';

describe('CriarOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let notificador: ReturnType<typeof criarNotificadorMock>;
  let useCase: CriarOrcamentoUseCase;

  const input = { ordemServicoId: 'uuid-os1', valorTotal: 350 };

  beforeEach(() => {
    gateway = criarGatewayMock();
    notificador = criarNotificadorMock();
    useCase = new CriarOrcamentoUseCase(gateway, notificador);
    gateway.criarEEnviarParaAprovacao.mockImplementation((orcamento) =>
      Promise.resolve(
        comTransicao(
          orcamento,
          StatusOS.EM_DIAGNOSTICO,
          StatusOS.AGUARDANDO_APROVACAO,
        ),
      ),
    );
  });

  it('cria o orçamento aguardando aprovação', async () => {
    const result = await useCase.execute(input);

    expect(result).toMatchObject({
      ordemServicoId: 'uuid-os1',
      valorTotal: 350,
      status: StatusOrcamento.AGUARDANDO_APROVACAO,
    });
    expect(gateway.criarEEnviarParaAprovacao).toHaveBeenCalled();
  });

  it('avisa o cliente de que a OS entrou em aprovação', async () => {
    await useCase.execute(input);

    expect(notificador.notificarMudancaDeStatus).toHaveBeenCalledWith({
      destinatario: clienteFake,
      numeroOS: 42,
      statusAnterior: StatusOS.EM_DIAGNOSTICO,
      statusNovo: StatusOS.AGUARDANDO_APROVACAO,
    });
  });

  it('não avisa o cliente quando a OS não sai do lugar', async () => {
    gateway.criarEEnviarParaAprovacao.mockImplementation((orcamento) =>
      Promise.resolve(semTransicao(orcamento)),
    );

    await useCase.execute(input);

    expect(notificador.notificarMudancaDeStatus).not.toHaveBeenCalled();
  });

  it('falha quando a OS não existe', async () => {
    gateway.buscarOrdemComPecas.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(
      OrdemDoOrcamentoNaoEncontradaError,
    );
    expect(gateway.criarEEnviarParaAprovacao).not.toHaveBeenCalled();
  });

  it('recusa valor inválido', async () => {
    await expect(useCase.execute({ ...input, valorTotal: 0 })).rejects.toThrow(
      ValorOrcamentoInvalidoError,
    );
    expect(gateway.criarEEnviarParaAprovacao).not.toHaveBeenCalled();
  });

  it('recusa um segundo orçamento enquanto o atual aguarda aprovação', async () => {
    gateway.existeOrcamentoAguardandoAprovacao.mockResolvedValue(true);

    await expect(useCase.execute(input)).rejects.toThrow(
      OrcamentoEmAbertoError,
    );
    expect(gateway.criarEEnviarParaAprovacao).not.toHaveBeenCalled();
  });

  it('permite gerar nova proposta depois que a anterior foi recusada', async () => {
    gateway.existeOrcamentoAguardandoAprovacao.mockResolvedValue(false);

    const result = await useCase.execute({ ...input, valorTotal: 600 });

    expect(result).toMatchObject({
      valorTotal: 600,
      status: StatusOrcamento.AGUARDANDO_APROVACAO,
    });
  });
});
