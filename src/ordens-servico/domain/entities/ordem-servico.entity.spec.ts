import { TransicaoStatusInvalidaError } from '../errors/ordem-servico.errors';
import { StatusOS } from '../status-os';
import { ItemPecaOrdem, ItemServicoOrdem } from './item-ordem';
import { OrdemServico } from './ordem-servico.entity';

const criarOrdem = (status?: StatusOS) =>
  new OrdemServico({
    id: 'uuid-os1',
    clienteId: 'uuid-c1',
    veiculoId: 'uuid-v1',
    status,
  });

describe('OrdemServico', () => {
  it('nasce como RECEBIDA', () => {
    expect(criarOrdem().status).toBe(StatusOS.RECEBIDA);
  });

  describe('máquina de estados', () => {
    it('avança pelo fluxo feliz até a entrega', () => {
      const ordem = criarOrdem();

      ordem.alterarStatus(StatusOS.EM_DIAGNOSTICO);
      ordem.alterarStatus(StatusOS.AGUARDANDO_APROVACAO);
      ordem.alterarStatus(StatusOS.EM_EXECUCAO);
      ordem.alterarStatus(StatusOS.FINALIZADA);
      ordem.alterarStatus(StatusOS.ENTREGUE);

      expect(ordem.status).toBe(StatusOS.ENTREGUE);
    });

    it('recusa salto de RECEBIDA direto para EM_EXECUCAO', () => {
      const ordem = criarOrdem();

      expect(() => ordem.alterarStatus(StatusOS.EM_EXECUCAO)).toThrow(
        TransicaoStatusInvalidaError,
      );
      expect(ordem.status).toBe(StatusOS.RECEBIDA);
    });

    it('recusa qualquer transição a partir de ENTREGUE', () => {
      const ordem = criarOrdem(StatusOS.ENTREGUE);

      expect(() => ordem.alterarStatus(StatusOS.EM_EXECUCAO)).toThrow(
        TransicaoStatusInvalidaError,
      );
    });

    it('permite voltar de AGUARDANDO_APROVACAO para EM_DIAGNOSTICO', () => {
      const ordem = criarOrdem(StatusOS.AGUARDANDO_APROVACAO);

      ordem.alterarStatus(StatusOS.EM_DIAGNOSTICO);

      expect(ordem.status).toBe(StatusOS.EM_DIAGNOSTICO);
    });

    it('trata a repetição do mesmo status como no-op', () => {
      const ordem = criarOrdem(StatusOS.EM_EXECUCAO);

      ordem.alterarStatus(StatusOS.EM_EXECUCAO);

      expect(ordem.status).toBe(StatusOS.EM_EXECUCAO);
      expect(ordem.iniciadaEm).toBeNull();
    });
  });

  describe('marcos de tempo', () => {
    it('carimba iniciadaEm ao entrar em execução', () => {
      const ordem = criarOrdem(StatusOS.AGUARDANDO_APROVACAO);
      const agora = new Date('2026-01-01T10:00:00Z');

      ordem.alterarStatus(StatusOS.EM_EXECUCAO, agora);

      expect(ordem.iniciadaEm).toEqual(agora);
    });

    it('carimba finalizadaEm e entregueEm nas respectivas transições', () => {
      const ordem = criarOrdem(StatusOS.EM_EXECUCAO);
      const fim = new Date('2026-01-02T10:00:00Z');
      const entrega = new Date('2026-01-03T10:00:00Z');

      ordem.alterarStatus(StatusOS.FINALIZADA, fim);
      ordem.alterarStatus(StatusOS.ENTREGUE, entrega);

      expect(ordem.finalizadaEm).toEqual(fim);
      expect(ordem.entregueEm).toEqual(entrega);
    });

    it('não sobrescreve iniciadaEm de uma OS que já esteve em execução', () => {
      const inicioOriginal = new Date('2026-01-01T10:00:00Z');
      const ordem = new OrdemServico({
        clienteId: 'uuid-c1',
        veiculoId: 'uuid-v1',
        status: StatusOS.AGUARDANDO_APROVACAO,
        iniciadaEm: inicioOriginal,
      });

      ordem.alterarStatus(StatusOS.EM_EXECUCAO, new Date());

      expect(ordem.iniciadaEm).toEqual(inicioOriginal);
    });
  });

  describe('itens e valor total', () => {
    it('soma serviços e peças pelos preços congelados', () => {
      const ordem = criarOrdem();

      ordem.adicionarServico(
        new ItemServicoOrdem({
          servicoId: 'uuid-s1',
          quantidade: 2,
          precoUnitario: 150,
        }),
      );
      ordem.adicionarPeca(
        new ItemPecaOrdem({
          pecaId: 'uuid-p1',
          quantidade: 3,
          precoUnitario: 29.9,
        }),
      );

      expect(ordem.valorTotal()).toBeCloseTo(389.7, 2);
    });

    it('rastreia apenas os itens incluídos nesta operação', () => {
      const ordem = new OrdemServico({
        clienteId: 'uuid-c1',
        veiculoId: 'uuid-v1',
        servicos: [
          new ItemServicoOrdem({
            id: 'existente',
            servicoId: 'uuid-s0',
            quantidade: 1,
            precoUnitario: 100,
          }),
        ],
      });

      ordem.adicionarServico(
        new ItemServicoOrdem({
          servicoId: 'uuid-s1',
          quantidade: 1,
          precoUnitario: 50,
        }),
      );

      expect(ordem.servicos).toHaveLength(2);
      expect(ordem.servicosAdicionados).toHaveLength(1);
      expect(ordem.servicosAdicionados[0].servicoId).toBe('uuid-s1');
    });
  });
});
