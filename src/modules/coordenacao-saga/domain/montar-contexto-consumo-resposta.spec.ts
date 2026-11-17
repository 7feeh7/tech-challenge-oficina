import {
  montarContextoConsumoDaResposta,
  respostaAuditoriaInsuficiente,
  respostaExigeReconciliacaoConsumo,
  tipoFatoDeSituacao,
} from './montar-contexto-consumo-resposta';
import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from './resultado-cancelamento-execucao';
import { SituacaoTarefaCancelamento } from './situacao-tarefa-cancelamento';

describe('montar contexto consumo resposta', () => {
  it('exige reconciliação em JA_ENCERRADA FALHOU', () => {
    expect(
      respostaExigeReconciliacaoConsumo({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
      }),
    ).toBe(true);
  });

  it('marca auditoria insuficiente sem fatoTerminalEventId', () => {
    expect(
      respostaAuditoriaInsuficiente({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
        encerradaEm: '2026-01-01T12:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('não exige reconciliação para diagnóstico', () => {
    expect(
      respostaExigeReconciliacaoConsumo({
        tipoTarefa: TipoTarefaCancelamento.DIAGNOSTICO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
      }),
    ).toBe(false);
  });

  it('monta contexto com auditoria completa', () => {
    const ctx = montarContextoConsumoDaResposta({
      tipoTarefa: TipoTarefaCancelamento.REPARO,
      resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
      situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
      encerradaEm: '2026-01-01T12:00:00.000Z',
      fatoTerminalEventId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
      pecasUtilizadas: [{ itemId: 'p1', quantidade: 1 }],
    });
    expect(ctx?.eventId).toBe('a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0');
    expect(ctx?.tipoFato).toBe('REPARO_FALHOU');
  });

  it('exige reconciliação para INTERROMPIDA encerrada', () => {
    expect(
      respostaExigeReconciliacaoConsumo({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.INTERROMPIDA,
      }),
    ).toBe(true);
  });

  it('tipoFato mapeia INTERROMPIDA', () => {
    expect(tipoFatoDeSituacao(SituacaoTarefaCancelamento.INTERROMPIDA)).toBe(
      'REPARO_INTERROMPIDO',
    );
  });

  it('tipoFato retorna null para cancelada', () => {
    expect(tipoFatoDeSituacao(SituacaoTarefaCancelamento.CANCELADA)).toBeNull();
  });

  it('auditoria insuficiente sem encerradaEm', () => {
    expect(
      respostaAuditoriaInsuficiente({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
        fatoTerminalEventId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
      }),
    ).toBe(true);
  });

  it('exige reconciliação em JA_CONCLUIDA de reparo', () => {
    expect(
      respostaExigeReconciliacaoConsumo({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
        situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
      }),
    ).toBe(true);
  });

  it('montar contexto retorna null sem fatoTerminalEventId', () => {
    expect(
      montarContextoConsumoDaResposta({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
        encerradaEm: '2026-01-01T12:00:00.000Z',
      }),
    ).toBeNull();
  });
});
