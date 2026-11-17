import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { AcaoDecisao } from './acao-decisao';
import { decidir } from './decidir';
import type { OrdemParaDecisao } from './ordem-para-decisao';
import { TipoFatoSaga } from './tipo-fato-saga';

function ordem(
  parcial: Partial<OrdemParaDecisao> & Pick<OrdemParaDecisao, 'status'>,
): OrdemParaDecisao {
  return {
    rodadaVigente: 1,
    rodadaFato: 1,
    orderIdFato: null,
    orderIdJaRegistrado: null,
    mesmoOrderId: false,
    ...parcial,
  };
}

describe('decidir (fluxo principal E29)', () => {
  it('ignora fato de rodada antiga sem regredir status', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({
          status: StatusOS.AGUARDANDO_EXECUCAO,
          rodadaVigente: 2,
          rodadaFato: 1,
        }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('aplica PagamentoConfirmado em AGUARDANDO_PAGAMENTO', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({ status: StatusOS.AGUARDANDO_PAGAMENTO }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('concilia segundo pagamento com orderId diferente', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({
          status: StatusOS.AGUARDANDO_EXECUCAO,
          orderIdFato: 'ORD-2',
          orderIdJaRegistrado: 'ORD-1',
          mesmoOrderId: false,
        }),
      ),
    ).toBe(AcaoDecisao.CONCILIAR);
  });

  it('ignora PagamentoConfirmado repetido com o mesmo orderId', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({
          status: StatusOS.AGUARDANDO_EXECUCAO,
          orderIdFato: 'ORD-1',
          orderIdJaRegistrado: 'ORD-1',
          mesmoOrderId: true,
        }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('ignora OrcamentoRejeitado em EM_CANCELAMENTO', () => {
    expect(
      decidir(
        TipoFatoSaga.ORCAMENTO_REJEITADO,
        ordem({ status: StatusOS.EM_CANCELAMENTO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('aplica DiagnosticoIniciado na rodada 2 sem mudar status esperado', () => {
    expect(
      decidir(
        TipoFatoSaga.DIAGNOSTICO_INICIADO,
        ordem({
          status: StatusOS.EM_DIAGNOSTICO,
          rodadaVigente: 2,
          rodadaFato: 2,
        }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('aplica ReparoConcluido adiantado em AGUARDANDO_EXECUCAO (D2.13)', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_CONCLUIDO,
        ordem({ status: StatusOS.AGUARDANDO_EXECUCAO }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('ignora ReparoConcluido em AGUARDANDO_PAGAMENTO', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_CONCLUIDO,
        ordem({ status: StatusOS.AGUARDANDO_PAGAMENTO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('ignora fato atrasado em FINALIZADA', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_INICIADO,
        ordem({ status: StatusOS.FINALIZADA }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('ignora DiagnosticoIniciado duplicado já em EM_DIAGNOSTICO na rodada 1', () => {
    expect(
      decidir(
        TipoFatoSaga.DIAGNOSTICO_INICIADO,
        ordem({
          status: StatusOS.EM_DIAGNOSTICO,
          rodadaVigente: 1,
          rodadaFato: 1,
        }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('aplica DiagnosticoIniciado em RECEBIDA na rodada 1', () => {
    expect(
      decidir(
        TipoFatoSaga.DIAGNOSTICO_INICIADO,
        ordem({ status: StatusOS.RECEBIDA }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('ignora OrcamentoGerado em AGUARDANDO_APROVACAO (reentrega)', () => {
    expect(
      decidir(
        TipoFatoSaga.ORCAMENTO_GERADO,
        ordem({ status: StatusOS.AGUARDANDO_APROVACAO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('ignora TarefaDevolvida fora de EM_DIAGNOSTICO', () => {
    expect(
      decidir(
        TipoFatoSaga.TAREFA_DEVOLVIDA_A_FILA,
        ordem({ status: StatusOS.RECEBIDA }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('ignora ReparoIniciado fora de AGUARDANDO_EXECUCAO', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_INICIADO,
        ordem({ status: StatusOS.AGUARDANDO_PAGAMENTO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('concilia PagamentoConfirmado em FINALIZADA com orderId novo', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({
          status: StatusOS.FINALIZADA,
          orderIdFato: 'ORD-2',
          orderIdJaRegistrado: 'ORD-1',
        }),
      ),
    ).toBe(AcaoDecisao.CONCILIAR);
  });

  it('aplica cada fato principal no estado esperado', () => {
    const casos: Array<[TipoFatoSaga, StatusOS]> = [
      [TipoFatoSaga.TAREFA_DEVOLVIDA_A_FILA, StatusOS.EM_DIAGNOSTICO],
      [TipoFatoSaga.ORCAMENTO_GERADO, StatusOS.EM_DIAGNOSTICO],
      [TipoFatoSaga.ORCAMENTO_REJEITADO, StatusOS.AGUARDANDO_APROVACAO],
      [TipoFatoSaga.REPARO_INICIADO, StatusOS.AGUARDANDO_EXECUCAO],
      [TipoFatoSaga.REPARO_CONCLUIDO, StatusOS.EM_EXECUCAO],
    ];
    for (const [fato, status] of casos) {
      expect(decidir(fato, ordem({ status }))).toBe(AcaoDecisao.APLICAR);
    }
  });

  it('concilia fato financeiro fora do estado esperado sem regressão', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({ status: StatusOS.EM_DIAGNOSTICO }),
      ),
    ).toBe(AcaoDecisao.CONCILIAR);
  });
});
