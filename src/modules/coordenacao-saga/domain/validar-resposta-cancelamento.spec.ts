import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  describe('exemplos publicados pelo Execution (b8d52c6)', () => {
    const pasta = join(__dirname, '../../../../test/contratos/execution');
    const payloadDe = (arquivo: string): unknown =>
      (
        JSON.parse(readFileSync(join(pasta, arquivo), 'utf8')) as {
          payload: unknown;
        }
      ).payload;

    it.each(
      readdirSync(pasta).filter((arquivo) =>
        arquivo.startsWith('execution.resposta-cancelamento'),
      ),
    )('aceita %s', (arquivo) => {
      expect(() =>
        validarRespostaCancelamento(payloadDe(arquivo)),
      ).not.toThrow();
    });

    it('aceita a resposta de retrocompatibilidade sem os campos aditivos', () => {
      const resposta = validarRespostaCancelamento(
        payloadDe(
          'execution.resposta-cancelamento-retrocompatibilidade.v1.json',
        ),
      );
      expect(resposta.situacaoTarefa).toBeUndefined();
      expect(resposta.encerradaEm).toBeUndefined();
      expect(resposta.divergencias?.[0]?.tipo).toBeUndefined();
      expect(resposta.pecasUtilizadas).toHaveLength(1);
    });
  });

  describe('conteúdo realmente inválido continua recusado', () => {
    it('exige encerradaEm quando a resposta traz situacaoTarefa', () => {
      const { encerradaEm, ...semEncerradaEm } = baseReparoConcluido;
      void encerradaEm;
      expect(() => validarRespostaCancelamento(semEncerradaEm)).toThrow(
        ErroMensagemPermanente,
      );
    });

    it('exige tipo da divergência quando a resposta traz situacaoTarefa', () => {
      expect(() =>
        validarRespostaCancelamento({
          ...baseReparoConcluido,
          divergencias: [{ itemId: 'p1', quantidadePrevista: 2 }],
        }),
      ).toThrow(ErroMensagemPermanente);
    });

    it('recusa JA_ENCERRADA sem situacaoTarefa mesmo sem campos aditivos', () => {
      expect(() =>
        validarRespostaCancelamento({
          tipoTarefa: TipoTarefaCancelamento.REPARO,
          resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
          encerradaEm: '2026-01-01T12:00:00.000Z',
          pecasUtilizadas: [],
          servicosRealizados: [],
          divergencias: [],
        }),
      ).toThrow(ErroMensagemPermanente);
    });

    it('recusa reparo concluído sem as listas de consumo', () => {
      expect(() =>
        validarRespostaCancelamento({
          tipoTarefa: TipoTarefaCancelamento.REPARO,
          resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
          concluidaEm: '2026-01-01T12:00:00.000Z',
        }),
      ).toThrow(ErroMensagemPermanente);
    });

    it('recusa reparo concluído sem concluidaEm', () => {
      expect(() =>
        validarRespostaCancelamento({
          tipoTarefa: TipoTarefaCancelamento.REPARO,
          resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
          pecasUtilizadas: [],
          servicosRealizados: [],
          divergencias: [],
        }),
      ).toThrow(ErroMensagemPermanente);
    });
  });

  describe('CANCELADA_EM_ANDAMENTO só vale para diagnóstico (03, 06-saga)', () => {
    it('recusa a combinação com reparo como erro permanente', () => {
      expect(() =>
        validarRespostaCancelamento({
          tipoTarefa: TipoTarefaCancelamento.REPARO,
          resultado: ResultadoCancelamentoExecucao.CANCELADA_EM_ANDAMENTO,
        }),
      ).toThrow(ErroMensagemPermanente);
    });

    it('aceita com diagnóstico', () => {
      expect(
        validarRespostaCancelamento({
          tipoTarefa: TipoTarefaCancelamento.DIAGNOSTICO,
          resultado: ResultadoCancelamentoExecucao.CANCELADA_EM_ANDAMENTO,
        }),
      ).toMatchObject({
        tipoTarefa: TipoTarefaCancelamento.DIAGNOSTICO,
        resultado: ResultadoCancelamentoExecucao.CANCELADA_EM_ANDAMENTO,
      });
    });
  });
});
