import {
  DesistenciaNaoPermitidaError,
  DevolucaoTarefaFilaNaoPermitidaError,
  ItensOficiaisNaoEditaveisError,
  MotivoDesistenciaObrigatorioError,
  PatchOrdemServicoNaoPermitidoError,
  QuantidadeItemInvalidaError,
  RetiradaNaoPermitidaError,
  TransicaoStatusInvalidaError,
} from '../errors/ordem-servico.errors';
import { PRIORIDADE_FILA_POR_STATUS, StatusOS } from '../status-os';
import { ItemPecaOrdem, ItemServicoOrdem } from './item-ordem';
import { OrdemServico, OrdemServicoProps } from './ordem-servico.entity';

const criarOrdem = (props: Partial<OrdemServicoProps> = {}) =>
  new OrdemServico({
    id: 'uuid-os1',
    clienteId: 'uuid-c1',
    veiculoId: 'uuid-v1',
    ...props,
  });

const agora = new Date('2026-11-16T12:00:00.000Z');

describe('OrdemServico', () => {
  describe('criação', () => {
    it('nasce como RECEBIDA, na rodada 1 e com prioridade de fila', () => {
      const ordem = criarOrdem();

      expect(ordem.status).toBe(StatusOS.RECEBIDA);
      expect(ordem.rodadaVigente).toBe(1);
      expect(ordem.prioridadeFila).toBe(
        PRIORIDADE_FILA_POR_STATUS[StatusOS.RECEBIDA],
      );
    });

    it('gera um correlationId quando nenhum é informado', () => {
      expect(criarOrdem().correlationId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('preserva o correlationId persistido', () => {
      const ordem = criarOrdem({ correlationId: 'corr-fixo' });

      expect(ordem.correlationId).toBe('corr-fixo');
    });

    it('normaliza textos vazios para nulo', () => {
      const ordem = criarOrdem({
        descricaoProblema: '   ',
        diagnostico: '',
        motivoEncerramento: ' ',
      });

      expect(ordem.descricaoProblema).toBeNull();
      expect(ordem.diagnostico).toBeNull();
      expect(ordem.motivoEncerramento).toBeNull();
    });
  });

  describe('fluxo da saga', () => {
    it('avança pelo fluxo feliz até a entrega', () => {
      const ordem = criarOrdem();

      ordem.registrarDiagnosticoIniciado(agora);
      ordem.registrarOrcamentoGerado(agora);
      ordem.registrarReservaConfirmada(null, agora);
      ordem.registrarPagamentoConfirmado(agora);
      ordem.registrarReparoIniciado(agora);
      ordem.registrarReparoConcluido(agora);
      ordem.registrarRetirada(agora);

      expect(ordem.status).toBe(StatusOS.ENTREGUE);
      expect(ordem.iniciadaEm).toEqual(agora);
      expect(ordem.finalizadaEm).toEqual(agora);
      expect(ordem.entregueEm).toEqual(agora);
    });

    it('recalcula a prioridade de fila a cada mudança de status', () => {
      const ordem = criarOrdem();

      ordem.registrarDiagnosticoIniciado(agora);

      expect(ordem.prioridadeFila).toBe(
        PRIORIDADE_FILA_POR_STATUS[StatusOS.EM_DIAGNOSTICO],
      );
    });

    it('recusa salto de RECEBIDA direto para aguardando aprovação', () => {
      const ordem = criarOrdem();

      expect(() => ordem.registrarOrcamentoGerado(agora)).toThrow(
        TransicaoStatusInvalidaError,
      );
      expect(ordem.status).toBe(StatusOS.RECEBIDA);
    });

    it('recusa pagamento fora de AGUARDANDO_PAGAMENTO', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_DIAGNOSTICO });

      expect(() => ordem.registrarPagamentoConfirmado(agora)).toThrow(
        TransicaoStatusInvalidaError,
      );
    });

    it('guarda o prazo de referência da reserva', () => {
      const ordem = criarOrdem({ status: StatusOS.AGUARDANDO_APROVACAO });
      const prazo = new Date('2026-11-20T00:00:00.000Z');

      ordem.registrarReservaConfirmada(prazo, agora);

      expect(ordem.prazoReferenciaReserva).toEqual(prazo);
    });

    it('não sobrescreve marcos de tempo já carimbados', () => {
      const primeiro = new Date('2026-11-01T10:00:00.000Z');
      const ordem = criarOrdem({
        status: StatusOS.AGUARDANDO_EXECUCAO,
        iniciadaEm: primeiro,
      });

      ordem.registrarReparoIniciado(agora);

      expect(ordem.iniciadaEm).toEqual(primeiro);
    });

    it('conclui o cancelamento', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_CANCELAMENTO });

      ordem.registrarCancelamentoConcluido(agora);

      expect(ordem.status).toBe(StatusOS.CANCELADA);
    });

    it('aceita a exceção de reparo concluído antes do cancelamento', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_CANCELAMENTO });

      ordem.registrarExcecaoReparoConcluidoAntesCancelamento(agora);

      expect(ordem.status).toBe(StatusOS.FINALIZADA);
      expect(ordem.finalizadaEm).toEqual(agora);
    });
  });

  describe('devolução da tarefa à fila', () => {
    it('volta para RECEBIDA na rodada 1 antes da conclusão do diagnóstico', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_DIAGNOSTICO });

      ordem.registrarDevolucaoTarefaParaFila(agora);

      expect(ordem.status).toBe(StatusOS.RECEBIDA);
    });

    it.each([
      [
        'após a rodada 1',
        { status: StatusOS.EM_DIAGNOSTICO, rodadaVigente: 2 },
      ],
      [
        'com diagnóstico concluído',
        { status: StatusOS.EM_DIAGNOSTICO, diagnosticoConcluidoEm: agora },
      ],
      ['fora de EM_DIAGNOSTICO', { status: StatusOS.RECEBIDA }],
    ])('recusa a devolução %s', (_descricao, props) => {
      const ordem = criarOrdem(props);

      expect(() => ordem.registrarDevolucaoTarefaParaFila(agora)).toThrow(
        DevolucaoTarefaFilaNaoPermitidaError,
      );
    });
  });

  describe('orçamento rejeitado', () => {
    it('volta ao diagnóstico e abre uma nova rodada', () => {
      const ordem = criarOrdem({
        status: StatusOS.AGUARDANDO_APROVACAO,
        diagnosticoConcluidoEm: agora,
      });

      ordem.registrarOrcamentoRejeitado(agora);

      expect(ordem.status).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(ordem.rodadaVigente).toBe(2);
      expect(ordem.diagnosticoConcluidoEm).toBeNull();
    });

    it('mantém os itens da rodada anterior até o novo diagnóstico', () => {
      const ordem = criarOrdem({
        status: StatusOS.AGUARDANDO_APROVACAO,
        pecas: [
          new ItemPecaOrdem({ pecaId: 'p1', quantidade: 1, precoUnitario: 10 }),
        ],
      });

      ordem.registrarOrcamentoRejeitado(agora);

      expect(ordem.pecas).toHaveLength(1);
    });

    it('não abre rodada quando a OS não aguarda aprovação', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_DIAGNOSTICO });

      expect(() => ordem.registrarOrcamentoRejeitado(agora)).toThrow(
        TransicaoStatusInvalidaError,
      );
      expect(ordem.rodadaVigente).toBe(1);
    });
  });

  describe('desistência', () => {
    it.each([
      StatusOS.RECEBIDA,
      StatusOS.EM_DIAGNOSTICO,
      StatusOS.AGUARDANDO_APROVACAO,
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
    ])('entra em EM_CANCELAMENTO a partir de %s', (status) => {
      const ordem = criarOrdem({ status });

      ordem.registrarDesistencia('  Cliente desistiu  ', agora);

      expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
      expect(ordem.etapaOrigemCancelamento).toBe(status);
      expect(ordem.motivoEncerramento).toBe('Cliente desistiu');
      expect(ordem.prioridadeFila).toBe(
        PRIORIDADE_FILA_POR_STATUS[StatusOS.EM_CANCELAMENTO],
      );
    });

    it('exige motivo', () => {
      const ordem = criarOrdem();

      expect(() => ordem.registrarDesistencia('   ', agora)).toThrow(
        MotivoDesistenciaObrigatorioError,
      );
      expect(ordem.status).toBe(StatusOS.RECEBIDA);
    });

    it('é idempotente e preserva o primeiro motivo', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_EXECUCAO });
      ordem.registrarDesistencia('Primeiro motivo', agora);

      ordem.registrarDesistencia('Segundo motivo', agora);

      expect(ordem.motivoEncerramento).toBe('Primeiro motivo');
      expect(ordem.etapaOrigemCancelamento).toBe(StatusOS.EM_EXECUCAO);
    });

    it.each([StatusOS.FINALIZADA, StatusOS.CANCELADA, StatusOS.ENTREGUE])(
      'é recusada em %s',
      (status) => {
        const ordem = criarOrdem({ status });

        expect(() => ordem.registrarDesistencia('Motivo', agora)).toThrow(
          DesistenciaNaoPermitidaError,
        );
      },
    );
  });

  describe('retirada', () => {
    it('é idempotente quando já foi entregue', () => {
      const entregueEm = new Date('2026-11-10T00:00:00.000Z');
      const ordem = criarOrdem({ status: StatusOS.ENTREGUE, entregueEm });

      ordem.registrarRetirada(agora);

      expect(ordem.entregueEm).toEqual(entregueEm);
    });

    it('recusa a retirada antes de a OS ser finalizada', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_EXECUCAO });

      expect(() => ordem.registrarRetirada(agora)).toThrow(
        RetiradaNaoPermitidaError,
      );
    });

    it('recusa a devolução física de OS cancelada sem veículo liberado', () => {
      const ordem = criarOrdem({ status: StatusOS.CANCELADA });

      expect(() => ordem.registrarRetirada(agora)).toThrow(
        RetiradaNaoPermitidaError,
      );
    });

    it('registra a devolução física uma única vez, sem mudar o status', () => {
      const ordem = criarOrdem({
        status: StatusOS.CANCELADA,
        veiculoLiberadoRetirada: true,
      });

      ordem.registrarRetirada(agora);
      ordem.registrarRetirada(new Date('2026-11-17T00:00:00.000Z'));

      expect(ordem.status).toBe(StatusOS.CANCELADA);
      expect(ordem.devolvidaEm).toEqual(agora);
    });

    it('libera o veículo para retirada', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_CANCELAMENTO });

      ordem.marcarVeiculoLiberadoParaRetirada();
      ordem.registrarRetirada(agora);

      expect(ordem.veiculoLiberadoRetirada).toBe(true);
      expect(ordem.devolvidaEm).toEqual(agora);
    });
  });

  describe('descrição do problema', () => {
    it('altera em RECEBIDA antes do diagnóstico', () => {
      const ordem = criarOrdem({ descricaoProblema: 'Barulho' });

      ordem.alterarDescricaoProblema('  Barulho no freio  ');

      expect(ordem.descricaoProblema).toBe('Barulho no freio');
    });

    it.each([
      StatusOS.EM_DIAGNOSTICO,
      StatusOS.AGUARDANDO_APROVACAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.EM_CANCELAMENTO,
    ])('recusa a alteração em %s', (status) => {
      const ordem = criarOrdem({ status });

      expect(() => ordem.alterarDescricaoProblema('Novo texto')).toThrow(
        PatchOrdemServicoNaoPermitidoError,
      );
    });
  });

  describe('sugestões da abertura', () => {
    it('registra sugestões sem criar itens oficiais', () => {
      const ordem = criarOrdem();

      ordem.adicionarSugestao({ tipo: 'PECA', itemId: 'p1', quantidade: 2 });
      ordem.adicionarSugestao({ tipo: 'SERVICO', itemId: 's1', quantidade: 1 });

      expect(ordem.sugestoes).toHaveLength(2);
      expect(ordem.pecas).toHaveLength(0);
      expect(ordem.servicos).toHaveLength(0);
      expect(ordem.valorTotal()).toBe(0);
    });

    it('soma a quantidade de sugestões repetidas', () => {
      const ordem = criarOrdem();

      ordem.adicionarSugestao({ tipo: 'PECA', itemId: 'p1', quantidade: 2 });
      ordem.adicionarSugestao({ tipo: 'PECA', itemId: 'p1', quantidade: 3 });

      expect(ordem.sugestoes).toEqual([
        { tipo: 'PECA', itemId: 'p1', quantidade: 5 },
      ]);
    });

    it('recusa quantidade inválida', () => {
      const ordem = criarOrdem();

      expect(() =>
        ordem.adicionarSugestao({ tipo: 'PECA', itemId: 'p1', quantidade: 0 }),
      ).toThrow(QuantidadeItemInvalidaError);
    });

    it('recusa sugestão depois da abertura', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_DIAGNOSTICO });

      expect(() =>
        ordem.adicionarSugestao({ tipo: 'PECA', itemId: 'p1', quantidade: 1 }),
      ).toThrow(PatchOrdemServicoNaoPermitidoError);
    });
  });

  describe('itens oficiais', () => {
    const servico = () =>
      new ItemServicoOrdem({
        servicoId: 's1',
        quantidade: 2,
        precoUnitario: 50,
      });
    const peca = () =>
      new ItemPecaOrdem({ pecaId: 'p1', quantidade: 3, precoUnitario: 10 });

    it('aceita itens durante o diagnóstico e calcula o valor total', () => {
      const ordem = criarOrdem({ status: StatusOS.EM_DIAGNOSTICO });

      ordem.adicionarServicoOficial(servico());
      ordem.adicionarPecaOficial(peca());

      expect(ordem.valorTotal()).toBe(130);
      expect(ordem.servicosAdicionados).toHaveLength(1);
      expect(ordem.pecasAdicionadas).toHaveLength(1);
    });

    it('recusa itens fora do diagnóstico', () => {
      const ordem = criarOrdem({ status: StatusOS.AGUARDANDO_APROVACAO });

      expect(() => ordem.adicionarPecaOficial(peca())).toThrow(
        ItensOficiaisNaoEditaveisError,
      );
      expect(() => ordem.adicionarServicoOficial(servico())).toThrow(
        ItensOficiaisNaoEditaveisError,
      );
    });

    it('recusa itens depois de o diagnóstico ser concluído', () => {
      const ordem = criarOrdem({
        status: StatusOS.EM_DIAGNOSTICO,
        diagnosticoConcluidoEm: agora,
      });

      expect(() => ordem.adicionarPecaOficial(peca())).toThrow(
        ItensOficiaisNaoEditaveisError,
      );
    });

    it('substitui os itens da rodada anterior', () => {
      const ordem = criarOrdem({
        status: StatusOS.EM_DIAGNOSTICO,
        pecas: [
          new ItemPecaOrdem({
            pecaId: 'antiga',
            quantidade: 1,
            precoUnitario: 5,
          }),
        ],
      });

      ordem.substituirItensOficiais([servico()], [peca()]);

      expect(ordem.itensOficiaisSubstituidos).toBe(true);
      expect(ordem.pecas.map((item) => item.pecaId)).toEqual(['p1']);
      expect(ordem.servicos).toHaveLength(1);
    });

    it('recusa a substituição fora do diagnóstico', () => {
      const ordem = criarOrdem();

      expect(() => ordem.substituirItensOficiais([], [])).toThrow(
        ItensOficiaisNaoEditaveisError,
      );
    });
  });
});
