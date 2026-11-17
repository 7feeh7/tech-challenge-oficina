import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from './resultado-cancelamento-execucao';
import { SituacaoTarefaCancelamento } from './situacao-tarefa-cancelamento';
import { validarRespostaCancelamento } from './validar-resposta-cancelamento';

describe('validarRespostaCancelamento', () => {
  const baseReparoConcluido = {
    tipoTarefa: TipoTarefaCancelamento.REPARO,
    resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
    situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
    concluidaEm: '2026-01-01T12:00:00.000Z',
    encerradaEm: '2026-01-01T12:00:00.000Z',
    fatoTerminalEventId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
    pecasUtilizadas: [],
    servicosRealizados: [],
    divergencias: [],
  };

  it('aceita reparo concluído aditivo', () => {
    expect(validarRespostaCancelamento(baseReparoConcluido)).toMatchObject({
      situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
    });
  });

  it('rejeita diagnóstico com listas de consumo', () => {
    expect(() =>
      validarRespostaCancelamento({
        tipoTarefa: TipoTarefaCancelamento.DIAGNOSTICO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
        pecasUtilizadas: [],
      }),
    ).toThrow(ErroMensagemPermanente);
  });

  it('rejeita JA_CONCLUIDA com situacaoTarefa incompatível', () => {
    expect(() =>
      validarRespostaCancelamento({
        ...baseReparoConcluido,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
      }),
    ).toThrow(ErroMensagemPermanente);
  });

  it('permite legado sem situacaoTarefa', () => {
    const legado = { ...baseReparoConcluido };
    delete (legado as { situacaoTarefa?: string }).situacaoTarefa;
    expect(validarRespostaCancelamento(legado).situacaoTarefa).toBeUndefined();
  });

  it('exige situacaoTarefa em JA_ENCERRADA', () => {
    expect(() =>
      validarRespostaCancelamento({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      }),
    ).toThrow(ErroMensagemPermanente);
  });

  it('rejeita CANCELADA com fatoTerminalEventId', () => {
    expect(() =>
      validarRespostaCancelamento({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.CANCELADA,
        encerradaEm: '2026-01-01T12:00:00.000Z',
        fatoTerminalEventId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      }),
    ).toThrow(ErroMensagemPermanente);
  });

  it('aceita reparo INTERROMPIDO JA_ENCERRADA com auditoria', () => {
    expect(
      validarRespostaCancelamento({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.INTERROMPIDA,
        encerradaEm: '2026-01-01T12:00:00.000Z',
        fatoTerminalEventId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
        motivo: 'interrompido',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      }),
    ).toMatchObject({
      situacaoTarefa: SituacaoTarefaCancelamento.INTERROMPIDA,
    });
  });

  it('exige justificativa em divergência FORA_DA_LISTA', () => {
    expect(() =>
      validarRespostaCancelamento({
        ...baseReparoConcluido,
        divergencias: [
          {
            itemId: 'p1',
            tipo: 'FORA_DA_LISTA',
            quantidadePrevista: 0,
            quantidadeUtilizada: 1,
          },
        ],
      }),
    ).toThrow(ErroMensagemPermanente);
  });

  it('aceita CANCELADA sem fatoTerminalEventId', () => {
    expect(
      validarRespostaCancelamento({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.CANCELADA,
        encerradaEm: '2026-01-01T12:00:00.000Z',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      }),
    ).toMatchObject({
      situacaoTarefa: SituacaoTarefaCancelamento.CANCELADA,
    });
  });

  it('rejeita tipoTarefa inválido', () => {
    expect(() =>
      validarRespostaCancelamento({
        tipoTarefa: 'INVALIDO',
        resultado: ResultadoCancelamentoExecucao.CANCELADA_SEM_INICIO,
      }),
    ).toThrow(ErroMensagemPermanente);
  });

  it('rejeita payload não objeto', () => {
    expect(() => validarRespostaCancelamento(null)).toThrow(
      ErroMensagemPermanente,
    );
  });

  it('exige motivo em FALHOU JA_ENCERRADA', () => {
    expect(() =>
      validarRespostaCancelamento({
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
        encerradaEm: '2026-01-01T12:00:00.000Z',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      }),
    ).toThrow(ErroMensagemPermanente);
  });
});
