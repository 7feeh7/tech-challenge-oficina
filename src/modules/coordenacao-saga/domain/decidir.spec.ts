import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { AcaoDecisao } from './acao-decisao';
import { decidir } from './decidir';
import type { OrdemParaDecisao } from './ordem-para-decisao';
import { OrigemPagamento } from './origem-pagamento';
import { TipoFatoSaga } from './tipo-fato-saga';

function ordem(
  parcial: Partial<OrdemParaDecisao> & Pick<OrdemParaDecisao, 'status'>,
): OrdemParaDecisao {
  return {
    rodadaVigente: 1,
    rodadaFato: 1,
    orderIdFato: null,
    ordersPagas: [],
    consultaIdVigente: null,
    consultaIdFato: null,
    emCompensacaoConsultaE10: false,
    estornoDeSegundoPagamento: false,
    estornoSegundoPagamentoRegistrado: false,
    origemPagamento: null,
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
          ordersPagas: ['ORD-1'],
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
          ordersPagas: ['ORD-1'],
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
          ordersPagas: ['ORD-1'],
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

  it('aplica CobrancaExpirada em AGUARDANDO_PAGAMENTO', () => {
    expect(
      decidir(
        TipoFatoSaga.COBRANCA_EXPIRADA,
        ordem({ status: StatusOS.AGUARDANDO_PAGAMENTO }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('JA_CONCLUIDA de diagnostico nunca vira aplicacao E10', () => {
    expect(
      decidir(
        TipoFatoSaga.SITUACAO_FINANCEIRA,
        ordem({
          status: StatusOS.EM_DIAGNOSTICO,
          emCompensacaoConsultaE10: true,
        }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('aplica SituacaoFinanceira vigente em compensacao E10', () => {
    expect(
      decidir(
        TipoFatoSaga.SITUACAO_FINANCEIRA,
        ordem({
          status: StatusOS.EM_CANCELAMENTO,
          emCompensacaoConsultaE10: true,
          consultaIdVigente: 'c1',
          consultaIdFato: 'c1',
        }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('concilia PagamentoConfirmado em EM_CANCELAMENTO', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({ status: StatusOS.EM_CANCELAMENTO }),
      ),
    ).toBe(AcaoDecisao.CONCILIAR);
  });

  it('ignora SituacaoFinanceira com consultaId diferente da vigente', () => {
    expect(
      decidir(
        TipoFatoSaga.SITUACAO_FINANCEIRA,
        ordem({
          status: StatusOS.EM_CANCELAMENTO,
          consultaIdVigente: 'vig',
          consultaIdFato: 'outra',
        }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('aplica fatos de compensação em EM_CANCELAMENTO', () => {
    const fatos: TipoFatoSaga[] = [
      TipoFatoSaga.RESPOSTA_CANCELAMENTO,
      TipoFatoSaga.RESPOSTA_CANCELAMENTO_FINANCEIRO,
      TipoFatoSaga.REPARO_INTERROMPIDO,
    ];
    for (const fato of fatos) {
      expect(decidir(fato, ordem({ status: StatusOS.EM_CANCELAMENTO }))).toBe(
        AcaoDecisao.APLICAR,
      );
    }
    expect(
      decidir(
        TipoFatoSaga.REPARO_FALHOU,
        ordem({ status: StatusOS.EM_CANCELAMENTO }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('aplica ReparoFalhou em EM_EXECUCAO e AGUARDANDO_EXECUCAO', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_FALHOU,
        ordem({ status: StatusOS.EM_EXECUCAO }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
    expect(
      decidir(
        TipoFatoSaga.REPARO_FALHOU,
        ordem({ status: StatusOS.AGUARDANDO_EXECUCAO }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('ignora ReparoFalhou de rodada antiga', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_FALHOU,
        ordem({
          status: StatusOS.EM_EXECUCAO,
          rodadaVigente: 2,
          rodadaFato: 1,
        }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it.each([StatusOS.FINALIZADA, StatusOS.CANCELADA, StatusOS.ENTREGUE])(
    'ignora ReparoFalhou em %s',
    (status) => {
      expect(decidir(TipoFatoSaga.REPARO_FALHOU, ordem({ status }))).toBe(
        AcaoDecisao.IGNORAR,
      );
    },
  );

  it('ignora ReparoInterrompido fora de EM_CANCELAMENTO', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_INTERROMPIDO,
        ordem({ status: StatusOS.EM_EXECUCAO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
    expect(
      decidir(
        TipoFatoSaga.REPARO_INTERROMPIDO,
        ordem({ status: StatusOS.AGUARDANDO_EXECUCAO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('aplica ReparoIniciado em EM_CANCELAMENTO', () => {
    expect(
      decidir(
        TipoFatoSaga.REPARO_INICIADO,
        ordem({ status: StatusOS.EM_CANCELAMENTO }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('aplica estorno e pendência resolvida pós-encerramento', () => {
    expect(
      decidir(
        TipoFatoSaga.ESTORNO_CONCLUIDO,
        ordem({ status: StatusOS.CANCELADA }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
    expect(
      decidir(
        TipoFatoSaga.PENDENCIA_RESOLVIDA,
        ordem({ status: StatusOS.FINALIZADA }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('aplica o estorno concluído em execução só para registrar a evidência', () => {
    for (const status of [StatusOS.AGUARDANDO_EXECUCAO, StatusOS.EM_EXECUCAO]) {
      expect(decidir(TipoFatoSaga.ESTORNO_CONCLUIDO, ordem({ status }))).toBe(
        AcaoDecisao.APLICAR,
      );
    }
  });

  it('segue ignorando pendência resolvida em execução', () => {
    expect(
      decidir(
        TipoFatoSaga.PENDENCIA_RESOLVIDA,
        ordem({ status: StatusOS.EM_EXECUCAO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  it('concilia fato financeiro fora do estado esperado sem regressão', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({ status: StatusOS.EM_DIAGNOSTICO }),
      ),
    ).toBe(AcaoDecisao.CONCILIAR);
  });

  it('ignora PagamentoConfirmado repetido de order já paga em qualquer estado', () => {
    for (const status of [
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
      StatusOS.EM_CANCELAMENTO,
    ]) {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status,
            orderIdFato: 'ORD-1',
            ordersPagas: ['ORD-1', 'ORD-2'],
          }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    }
  });

  it('aplica o primeiro pagamento de uma order só criada (sem order paga na rodada)', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({
          status: StatusOS.AGUARDANDO_PAGAMENTO,
          orderIdFato: 'ORD-1',
          ordersPagas: [],
        }),
      ),
    ).toBe(AcaoDecisao.APLICAR);
  });

  it('concilia o pagamento de outra order quando já há order paga', () => {
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_CONFIRMADO,
        ordem({
          status: StatusOS.EM_EXECUCAO,
          orderIdFato: 'ORD-2',
          ordersPagas: ['ORD-1'],
        }),
      ),
    ).toBe(AcaoDecisao.CONCILIAR);
  });

  it('aplica PagamentoTardioRegistrado em CANCELADA e ENTREGUE e ignora nos demais estados', () => {
    for (const status of [StatusOS.CANCELADA, StatusOS.ENTREGUE]) {
      expect(
        decidir(TipoFatoSaga.PAGAMENTO_TARDIO_REGISTRADO, ordem({ status })),
      ).toBe(AcaoDecisao.APLICAR);
    }
    expect(
      decidir(
        TipoFatoSaga.PAGAMENTO_TARDIO_REGISTRADO,
        ordem({ status: StatusOS.AGUARDANDO_PAGAMENTO }),
      ),
    ).toBe(AcaoDecisao.IGNORAR);
  });

  describe('estorno do segundo pagamento em qualquer ordem de chegada', () => {
    const statusComSegundoPagamento = [
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
      StatusOS.EM_CANCELAMENTO,
      StatusOS.CANCELADA,
      StatusOS.ENTREGUE,
    ];

    it('aplica o estorno do segundo pagamento a partir de AGUARDANDO_PAGAMENTO', () => {
      for (const status of statusComSegundoPagamento) {
        expect(
          decidir(
            TipoFatoSaga.ESTORNO_CONCLUIDO,
            ordem({ status, estornoDeSegundoPagamento: true }),
          ),
        ).toBe(AcaoDecisao.APLICAR);
      }
    });

    it('mantém ignorado o estorno em AGUARDANDO_PAGAMENTO sem a origem do segundo pagamento', () => {
      expect(
        decidir(
          TipoFatoSaga.ESTORNO_CONCLUIDO,
          ordem({ status: StatusOS.AGUARDANDO_PAGAMENTO }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    });

    it('ignora o estorno do segundo pagamento antes de AGUARDANDO_PAGAMENTO', () => {
      expect(
        decidir(
          TipoFatoSaga.ESTORNO_CONCLUIDO,
          ordem({
            status: StatusOS.EM_DIAGNOSTICO,
            estornoDeSegundoPagamento: true,
          }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    });

    it('ignora o estorno do segundo pagamento de rodada antiga', () => {
      expect(
        decidir(
          TipoFatoSaga.ESTORNO_CONCLUIDO,
          ordem({
            status: StatusOS.AGUARDANDO_PAGAMENTO,
            rodadaVigente: 2,
            rodadaFato: 1,
            estornoDeSegundoPagamento: true,
          }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    });

    it('concilia o pagamento de order já estornada como segundo pagamento, nunca o aplica', () => {
      for (const status of statusComSegundoPagamento) {
        expect(
          decidir(
            TipoFatoSaga.PAGAMENTO_CONFIRMADO,
            ordem({
              status,
              orderIdFato: 'ORD-2',
              estornoSegundoPagamentoRegistrado: true,
            }),
          ),
        ).toBe(AcaoDecisao.CONCILIAR);
      }
    });

    it('ignora a repetição do pagamento de order já registrada como paga mesmo com estorno', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.EM_EXECUCAO,
            orderIdFato: 'ORD-2',
            ordersPagas: ['ORD-1', 'ORD-2'],
            estornoSegundoPagamentoRegistrado: true,
          }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    });

    it('ignora o pagamento de rodada antiga mesmo com estorno registrado', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.AGUARDANDO_PAGAMENTO,
            rodadaVigente: 2,
            rodadaFato: 1,
            estornoSegundoPagamentoRegistrado: true,
          }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    });

    it('continua aplicando o pagamento de outra order em AGUARDANDO_PAGAMENTO', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.AGUARDANDO_PAGAMENTO,
            orderIdFato: 'ORD-LEGITIMA',
            ordersPagas: [],
            estornoSegundoPagamentoRegistrado: false,
          }),
        ),
      ).toBe(AcaoDecisao.APLICAR);
    });
  });
  describe('classificação explícita do pagamento (origemPagamento)', () => {
    const todosOsStatus = [
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
      StatusOS.EM_CANCELAMENTO,
      StatusOS.CANCELADA,
      StatusOS.ENTREGUE,
    ];

    it('concilia o segundo pagamento em qualquer status, nunca o aplica', () => {
      for (const status of todosOsStatus) {
        expect(
          decidir(
            TipoFatoSaga.PAGAMENTO_CONFIRMADO,
            ordem({
              status,
              orderIdFato: 'ORD-2',
              origemPagamento: OrigemPagamento.SEGUNDO_PAGAMENTO,
            }),
          ),
        ).toBe(AcaoDecisao.CONCILIAR);
      }
    });

    it('concilia o segundo pagamento sem depender das orders pagas da projeção', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.AGUARDANDO_PAGAMENTO,
            orderIdFato: 'ORD-2',
            ordersPagas: ['ORD-2'],
            origemPagamento: OrigemPagamento.SEGUNDO_PAGAMENTO,
          }),
        ),
      ).toBe(AcaoDecisao.CONCILIAR);
    });

    it('ignora o segundo pagamento de rodada antiga', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.AGUARDANDO_PAGAMENTO,
            rodadaVigente: 2,
            rodadaFato: 1,
            orderIdFato: 'ORD-2',
            origemPagamento: OrigemPagamento.SEGUNDO_PAGAMENTO,
          }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    });

    it('aplica o pagamento legítimo em AGUARDANDO_PAGAMENTO, mesmo com segundo pagamento já registrado', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.AGUARDANDO_PAGAMENTO,
            orderIdFato: 'ORD-1',
            ordersPagas: [],
            origemPagamento: OrigemPagamento.PAGAMENTO_LEGITIMO,
          }),
        ),
      ).toBe(AcaoDecisao.APLICAR);
    });

    it('ignora a repetição do pagamento legítimo já registrado como pago', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.AGUARDANDO_EXECUCAO,
            orderIdFato: 'ORD-1',
            ordersPagas: ['ORD-1'],
            origemPagamento: OrigemPagamento.PAGAMENTO_LEGITIMO,
          }),
        ),
      ).toBe(AcaoDecisao.IGNORAR);
    });

    it('mantém a classificação pelo estado na mensagem legada, sem origemPagamento', () => {
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.AGUARDANDO_PAGAMENTO,
            orderIdFato: 'ORD-1',
            origemPagamento: null,
          }),
        ),
      ).toBe(AcaoDecisao.APLICAR);
      expect(
        decidir(
          TipoFatoSaga.PAGAMENTO_CONFIRMADO,
          ordem({
            status: StatusOS.EM_EXECUCAO,
            orderIdFato: 'ORD-2',
            ordersPagas: ['ORD-1'],
            origemPagamento: null,
          }),
        ),
      ).toBe(AcaoDecisao.CONCILIAR);
    });
  });
});
