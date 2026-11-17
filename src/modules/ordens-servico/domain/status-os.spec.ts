import {
  PRIORIDADE_FILA_POR_STATUS,
  STATUS_ABERTOS,
  STATUS_ENCERRADOS,
  StatusOS,
  estaEncerrada,
  prioridadeFilaDoStatus,
  transicaoPermitida,
} from './status-os';

describe('StatusOS', () => {
  it('trata FINALIZADA, CANCELADA e ENTREGUE como encerradas', () => {
    expect(estaEncerrada(StatusOS.FINALIZADA)).toBe(true);
    expect(estaEncerrada(StatusOS.CANCELADA)).toBe(true);
    expect(estaEncerrada(StatusOS.ENTREGUE)).toBe(true);
    expect(estaEncerrada(StatusOS.EM_EXECUCAO)).toBe(false);
  });

  it('prioriza a fila pelos valores persistidos (D2.27)', () => {
    const ordenados = [...STATUS_ABERTOS].sort(
      (a, b) => prioridadeFilaDoStatus(a) - prioridadeFilaDoStatus(b),
    );

    expect(ordenados).toEqual([
      StatusOS.EM_EXECUCAO,
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.AGUARDANDO_PAGAMENTO,
      StatusOS.AGUARDANDO_APROVACAO,
      StatusOS.EM_DIAGNOSTICO,
      StatusOS.RECEBIDA,
      StatusOS.EM_CANCELAMENTO,
    ]);
  });

  it('não permite transição a partir de ENTREGUE', () => {
    expect(transicaoPermitida(StatusOS.ENTREGUE, StatusOS.EM_EXECUCAO)).toBe(
      false,
    );
  });

  it('não permite atalho RECEBIDA → AGUARDANDO_APROVACAO (exceção E1 revogada)', () => {
    expect(
      transicaoPermitida(StatusOS.RECEBIDA, StatusOS.AGUARDANDO_APROVACAO),
    ).toBe(false);
  });

  describe('transições do fluxo de orçamento', () => {
    it('gerar orçamento: de EM_DIAGNOSTICO para AGUARDANDO_APROVACAO', () => {
      expect(
        transicaoPermitida(
          StatusOS.EM_DIAGNOSTICO,
          StatusOS.AGUARDANDO_APROVACAO,
        ),
      ).toBe(true);
    });

    it('rejeitar: de AGUARDANDO_APROVACAO para EM_DIAGNOSTICO', () => {
      expect(
        transicaoPermitida(
          StatusOS.AGUARDANDO_APROVACAO,
          StatusOS.EM_DIAGNOSTICO,
        ),
      ).toBe(true);
    });

    it('reserva: de AGUARDANDO_APROVACAO para AGUARDANDO_PAGAMENTO', () => {
      expect(
        transicaoPermitida(
          StatusOS.AGUARDANDO_APROVACAO,
          StatusOS.AGUARDANDO_PAGAMENTO,
        ),
      ).toBe(true);
    });

    it('pagamento: de AGUARDANDO_PAGAMENTO para AGUARDANDO_EXECUCAO', () => {
      expect(
        transicaoPermitida(
          StatusOS.AGUARDANDO_PAGAMENTO,
          StatusOS.AGUARDANDO_EXECUCAO,
        ),
      ).toBe(true);
    });

    it('reparo: de AGUARDANDO_EXECUCAO para EM_EXECUCAO', () => {
      expect(
        transicaoPermitida(StatusOS.AGUARDANDO_EXECUCAO, StatusOS.EM_EXECUCAO),
      ).toBe(true);
    });
  });

  it('cada status aberto ou encerrado tem prioridade definida', () => {
    for (const status of [...STATUS_ABERTOS, ...STATUS_ENCERRADOS]) {
      expect(PRIORIDADE_FILA_POR_STATUS[status]).toBeGreaterThan(0);
    }
  });
});
