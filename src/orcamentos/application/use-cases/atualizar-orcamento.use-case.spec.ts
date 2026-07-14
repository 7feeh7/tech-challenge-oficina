import { StatusOS } from '@/ordens-servico/domain/status-os';
import {
  EstoqueInsuficienteParaAprovacaoError,
  MotivoRejeicaoObrigatorioError,
  OrcamentoNaoEncontradoError,
} from '../../domain/errors/orcamento.errors';
import { StatusOrcamento } from '../../domain/status-orcamento';
import { AtualizarOrcamentoUseCase } from './atualizar-orcamento.use-case';
import {
  clienteFake,
  comTransicao,
  criarGatewayMock,
  criarNotificadorMock,
  criarOrcamentoFake,
  semTransicao,
} from './test-doubles';

describe('AtualizarOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let notificador: ReturnType<typeof criarNotificadorMock>;
  let useCase: AtualizarOrcamentoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    notificador = criarNotificadorMock();
    useCase = new AtualizarOrcamentoUseCase(gateway, notificador);
    gateway.atualizar.mockImplementation((_id, orcamento) =>
      Promise.resolve(orcamento),
    );
    gateway.aprovarComBaixaDeEstoque.mockImplementation((orcamento) =>
      Promise.resolve(
        comTransicao(
          orcamento,
          StatusOS.AGUARDANDO_APROVACAO,
          StatusOS.EM_EXECUCAO,
        ),
      ),
    );
    gateway.rejeitarEDevolverParaDiagnostico.mockImplementation((orcamento) =>
      Promise.resolve(
        comTransicao(
          orcamento,
          StatusOS.AGUARDANDO_APROVACAO,
          StatusOS.EM_DIAGNOSTICO,
        ),
      ),
    );
  });

  it('falha quando o orçamento não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('inexistente', { valorTotal: 100 }),
    ).rejects.toThrow(OrcamentoNaoEncontradoError);
  });

  it('edita valor e observações sem mexer no status', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());

    const result = await useCase.execute('uuid-orc1', {
      valorTotal: 500,
      observacoes: 'Revisado',
    });

    expect(result).toMatchObject({
      valorTotal: 500,
      observacoes: 'Revisado',
      status: StatusOrcamento.AGUARDANDO_APROVACAO,
    });
    expect(gateway.aprovarComBaixaDeEstoque).not.toHaveBeenCalled();
  });

  it('recusa rejeição sem motivo', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());

    await expect(
      useCase.execute('uuid-orc1', { status: StatusOrcamento.REJEITADO }),
    ).rejects.toThrow(MotivoRejeicaoObrigatorioError);
    expect(gateway.atualizar).not.toHaveBeenCalled();
  });

  describe('recusa', () => {
    it('rejeita o orçamento e devolve a OS ao diagnóstico', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());

      const result = await useCase.execute('uuid-orc1', {
        status: StatusOrcamento.REJEITADO,
        motivoRejeicao: 'Cliente achou caro',
      });

      expect(result).toMatchObject({
        status: StatusOrcamento.REJEITADO,
        motivoRejeicao: 'Cliente achou caro',
      });
      expect(gateway.rejeitarEDevolverParaDiagnostico).toHaveBeenCalled();
      // a recusa é uma rodada de negociação: não é uma edição simples
      expect(gateway.atualizar).not.toHaveBeenCalled();
    });

    it('não devolve a OS ao diagnóstico de novo ao reenviar a recusa', async () => {
      gateway.buscarPorId.mockResolvedValue(
        criarOrcamentoFake({
          status: StatusOrcamento.REJEITADO,
          motivoRejeicao: 'Cliente achou caro',
        }),
      );

      await useCase.execute('uuid-orc1', {
        status: StatusOrcamento.REJEITADO,
        motivoRejeicao: 'Cliente achou caro',
      });

      expect(gateway.rejeitarEDevolverParaDiagnostico).not.toHaveBeenCalled();
      expect(gateway.atualizar).toHaveBeenCalled();
      expect(notificador.notificarMudancaDeStatus).not.toHaveBeenCalled();
    });

    it('avisa o cliente de que a OS voltou ao diagnóstico', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());

      await useCase.execute('uuid-orc1', {
        status: StatusOrcamento.REJEITADO,
        motivoRejeicao: 'Cliente achou caro',
      });

      expect(notificador.notificarMudancaDeStatus).toHaveBeenCalledWith({
        destinatario: clienteFake,
        numeroOS: 42,
        statusAnterior: StatusOS.AGUARDANDO_APROVACAO,
        statusNovo: StatusOS.EM_DIAGNOSTICO,
      });
    });

    it('não avisa o cliente quando a OS já tinha seguido outro caminho', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());
      gateway.rejeitarEDevolverParaDiagnostico.mockImplementation((orcamento) =>
        Promise.resolve(semTransicao(orcamento)),
      );

      await useCase.execute('uuid-orc1', {
        status: StatusOrcamento.REJEITADO,
        motivoRejeicao: 'Cliente achou caro',
      });

      expect(notificador.notificarMudancaDeStatus).not.toHaveBeenCalled();
    });
  });

  describe('aprovação', () => {
    it('aprova e baixa o estoque das peças da OS', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());
      gateway.buscarOrdemComPecas.mockResolvedValue({
        id: 'uuid-os1',
        pecas: [
          { pecaId: 'uuid-p1', quantidade: 2, saldoDisponivel: 10 },
          { pecaId: 'uuid-p2', quantidade: 5, saldoDisponivel: 5 },
        ],
      });

      const result = await useCase.execute('uuid-orc1', {
        status: StatusOrcamento.APROVADO,
      });

      expect(result.status).toBe(StatusOrcamento.APROVADO);
      expect(gateway.aprovarComBaixaDeEstoque).toHaveBeenCalledWith(
        expect.anything(),
        [
          { pecaId: 'uuid-p1', quantidade: 2, novoSaldo: 8 },
          { pecaId: 'uuid-p2', quantidade: 5, novoSaldo: 0 },
        ],
      );
    });

    it('recusa a aprovação quando falta estoque para qualquer peça', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());
      gateway.buscarOrdemComPecas.mockResolvedValue({
        id: 'uuid-os1',
        pecas: [
          { pecaId: 'uuid-p1', quantidade: 2, saldoDisponivel: 10 },
          { pecaId: 'uuid-p2', quantidade: 5, saldoDisponivel: 3 },
        ],
      });

      await expect(
        useCase.execute('uuid-orc1', { status: StatusOrcamento.APROVADO }),
      ).rejects.toThrow(EstoqueInsuficienteParaAprovacaoError);

      // nenhuma baixa é aplicada: ou todas cabem, ou nenhuma
      expect(gateway.aprovarComBaixaDeEstoque).not.toHaveBeenCalled();
      expect(gateway.atualizar).not.toHaveBeenCalled();
    });

    it('aprova OS sem peças sem gerar nenhuma baixa', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());
      gateway.buscarOrdemComPecas.mockResolvedValue({
        id: 'uuid-os1',
        pecas: [],
      });

      await useCase.execute('uuid-orc1', { status: StatusOrcamento.APROVADO });

      expect(gateway.aprovarComBaixaDeEstoque).toHaveBeenCalledWith(
        expect.anything(),
        [],
      );
    });

    it('não baixa estoque de novo ao reenviar aprovação de orçamento já aprovado', async () => {
      gateway.buscarPorId.mockResolvedValue(
        criarOrcamentoFake({ status: StatusOrcamento.APROVADO }),
      );

      await useCase.execute('uuid-orc1', { status: StatusOrcamento.APROVADO });

      expect(gateway.aprovarComBaixaDeEstoque).not.toHaveBeenCalled();
      expect(gateway.atualizar).toHaveBeenCalled();
      expect(notificador.notificarMudancaDeStatus).not.toHaveBeenCalled();
    });

    it('avisa o cliente de que o carro entrou em execução', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());
      gateway.buscarOrdemComPecas.mockResolvedValue({
        id: 'uuid-os1',
        pecas: [],
      });

      await useCase.execute('uuid-orc1', { status: StatusOrcamento.APROVADO });

      expect(notificador.notificarMudancaDeStatus).toHaveBeenCalledWith({
        destinatario: clienteFake,
        numeroOS: 42,
        statusAnterior: StatusOS.AGUARDANDO_APROVACAO,
        statusNovo: StatusOS.EM_EXECUCAO,
      });
    });

    it('não avisa o cliente quando a aprovação é recusada por falta de estoque', async () => {
      gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());
      gateway.buscarOrdemComPecas.mockResolvedValue({
        id: 'uuid-os1',
        pecas: [{ pecaId: 'uuid-p1', quantidade: 5, saldoDisponivel: 3 }],
      });

      await expect(
        useCase.execute('uuid-orc1', { status: StatusOrcamento.APROVADO }),
      ).rejects.toThrow(EstoqueInsuficienteParaAprovacaoError);
      expect(notificador.notificarMudancaDeStatus).not.toHaveBeenCalled();
    });
  });
});
