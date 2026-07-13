import {
  EstoqueInsuficienteParaAprovacaoError,
  MotivoRejeicaoObrigatorioError,
  OrcamentoNaoEncontradoError,
} from '../../domain/errors/orcamento.errors';
import { StatusOrcamento } from '../../domain/status-orcamento';
import { AtualizarOrcamentoUseCase } from './atualizar-orcamento.use-case';
import { criarGatewayMock, criarOrcamentoFake } from './test-doubles';

describe('AtualizarOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let useCase: AtualizarOrcamentoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    useCase = new AtualizarOrcamentoUseCase(gateway);
    gateway.atualizar.mockImplementation((_id, orcamento) =>
      Promise.resolve(orcamento),
    );
    gateway.aprovarComBaixaDeEstoque.mockImplementation((orcamento) =>
      Promise.resolve(orcamento),
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

  it('rejeita o orçamento registrando o motivo', async () => {
    gateway.buscarPorId.mockResolvedValue(criarOrcamentoFake());

    const result = await useCase.execute('uuid-orc1', {
      status: StatusOrcamento.REJEITADO,
      motivoRejeicao: 'Cliente achou caro',
    });

    expect(result).toMatchObject({
      status: StatusOrcamento.REJEITADO,
      motivoRejeicao: 'Cliente achou caro',
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
    });
  });
});
