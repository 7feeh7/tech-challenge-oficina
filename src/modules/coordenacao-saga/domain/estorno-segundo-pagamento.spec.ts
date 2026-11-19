import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import {
  deveGravarEvidenciaEstorno,
  ehEstornoDeSegundoPagamento,
  montarEvidenciaEstorno,
  validarEstornoDeSegundoPagamento,
} from './estorno-segundo-pagamento';

describe('estorno do segundo pagamento (domínio)', () => {
  const payloadIntegral = {
    cobrancaId: 'cob-1',
    orderId: 'ORD-2',
    valorEstornadoCentavos: 500,
    tipoEstorno: 'INTEGRAL',
    estornadoEm: '2026-11-19T10:00:00.000Z',
    statusOrderMercadoPago: 'refunded',
    origemEstorno: 'SEGUNDO_PAGAMENTO',
  };

  describe('ehEstornoDeSegundoPagamento', () => {
    it('reconhece só a origem SEGUNDO_PAGAMENTO', () => {
      expect(ehEstornoDeSegundoPagamento(payloadIntegral)).toBe(true);
      expect(
        ehEstornoDeSegundoPagamento({
          ...payloadIntegral,
          origemEstorno: 'PENDENCIA_RESOLVIDA',
        }),
      ).toBe(false);
      expect(
        ehEstornoDeSegundoPagamento({
          ...payloadIntegral,
          origemEstorno: undefined,
        }),
      ).toBe(false);
    });
  });

  describe('validarEstornoDeSegundoPagamento', () => {
    it('aceita o estorno integral com orderId', () => {
      expect(() =>
        validarEstornoDeSegundoPagamento(payloadIntegral),
      ).not.toThrow();
    });

    it.each([undefined, '', '   '])(
      'recusa o orderId %p com erro permanente',
      (orderId) => {
        expect(() =>
          validarEstornoDeSegundoPagamento({ ...payloadIntegral, orderId }),
        ).toThrow(ErroMensagemPermanente);
      },
    );

    it.each([undefined, 'PARCIAL'])(
      'recusa o tipoEstorno %p com erro permanente',
      (tipoEstorno) => {
        expect(() =>
          validarEstornoDeSegundoPagamento({ ...payloadIntegral, tipoEstorno }),
        ).toThrow(ErroMensagemPermanente);
      },
    );
  });

  describe('montarEvidenciaEstorno', () => {
    it('reúne o evento e os dados do estorno sem a origem', () => {
      expect(montarEvidenciaEstorno('e-1', payloadIntegral)).toEqual({
        eventId: 'e-1',
        cobrancaId: 'cob-1',
        orderId: 'ORD-2',
        valorEstornadoCentavos: 500,
        tipoEstorno: 'INTEGRAL',
        estornadoEm: '2026-11-19T10:00:00.000Z',
        statusOrderMercadoPago: 'refunded',
      });
    });
  });

  describe('deveGravarEvidenciaEstorno', () => {
    it('grava quando ainda não há evidência', () => {
      expect(deveGravarEvidenciaEstorno(undefined, 'e-1')).toBe(true);
    });

    it('não regrava a reentrega do mesmo evento', () => {
      expect(
        deveGravarEvidenciaEstorno(
          { eventId: 'e-1', tipoEstorno: 'PARCIAL' },
          'e-1',
        ),
      ).toBe(false);
    });

    it('não substitui a evidência integral por outro evento', () => {
      expect(
        deveGravarEvidenciaEstorno(
          { eventId: 'e-1', tipoEstorno: 'INTEGRAL' },
          'e-2',
        ),
      ).toBe(false);
    });

    it('substitui a evidência parcial por outro evento', () => {
      expect(
        deveGravarEvidenciaEstorno(
          { eventId: 'e-1', tipoEstorno: 'PARCIAL' },
          'e-2',
        ),
      ).toBe(true);
    });
  });
});
