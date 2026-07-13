import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRIORIDADE_NA_FILA,
  STATUS_ABERTOS,
  STATUS_ENCERRADOS,
  StatusOS,
  estaEncerrada,
  transicaoPermitida,
} from './status-os';

describe('StatusOS', () => {
  it('trata FINALIZADA e ENTREGUE como encerradas', () => {
    expect(estaEncerrada(StatusOS.FINALIZADA)).toBe(true);
    expect(estaEncerrada(StatusOS.ENTREGUE)).toBe(true);
    expect(estaEncerrada(StatusOS.EM_EXECUCAO)).toBe(false);
  });

  it('prioriza a fila como Em Execução > Aguardando Aprovação > Diagnóstico > Recebida', () => {
    const ordenados = [...STATUS_ABERTOS].sort(
      (a, b) => PRIORIDADE_NA_FILA[a] - PRIORIDADE_NA_FILA[b],
    );

    expect(ordenados).toEqual([
      StatusOS.EM_EXECUCAO,
      StatusOS.AGUARDANDO_APROVACAO,
      StatusOS.EM_DIAGNOSTICO,
      StatusOS.RECEBIDA,
    ]);
  });

  it('não permite transição a partir de ENTREGUE', () => {
    expect(transicaoPermitida(StatusOS.ENTREGUE, StatusOS.EM_EXECUCAO)).toBe(
      false,
    );
  });

  /**
   * A listagem da fila ordena por `status: 'desc'` no Prisma, e o Postgres
   * ordena enums pela ordem de DECLARAÇÃO. Se alguém reordenar o enum no
   * schema, a prioridade da fila quebra silenciosamente — este teste falha
   * primeiro.
   */
  it('a ordem de declaração do enum no schema.prisma sustenta a prioridade da fila', () => {
    const schema = readFileSync(
      join(__dirname, '../../../prisma/schema.prisma'),
      'utf8',
    );
    const bloco = /enum StatusOS \{([^}]*)\}/.exec(schema);
    const declarados = (bloco?.[1] ?? '')
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean);

    // Invertida, a ordem de declaração precisa colocar os abertos na prioridade
    // da fila, com os encerrados no topo (e por isso excluídos pelo `notIn`).
    expect([...declarados].reverse()).toEqual([
      ...[...STATUS_ENCERRADOS].reverse(),
      ...STATUS_ABERTOS,
    ]);
  });
});
