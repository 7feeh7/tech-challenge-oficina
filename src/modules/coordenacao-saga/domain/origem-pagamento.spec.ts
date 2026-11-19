import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import {
  lerOrigemPagamento,
  OrigemPagamento,
  validarPagamentoLegitimoSemEstorno,
  validarSegundoPagamento,
} from './origem-pagamento';

describe('origem do pagamento', () => {
  describe('lerOrigemPagamento', () => {
    it.each([
      ['PAGAMENTO_LEGITIMO', OrigemPagamento.PAGAMENTO_LEGITIMO],
      ['SEGUNDO_PAGAMENTO', OrigemPagamento.SEGUNDO_PAGAMENTO],
    ])('reconhece %s', (valor, esperado) => {
      expect(lerOrigemPagamento(valor)).toBe(esperado);
    });

    it('trata a ausência do campo como mensagem legada', () => {
      expect(lerOrigemPagamento(undefined)).toBeNull();
    });

    it.each([['OUTRA'], [''], ['segundo_pagamento'], [null], [1], [{}]])(
      'recusa o valor desconhecido %p com erro permanente',
      (valor) => {
        expect(() => lerOrigemPagamento(valor)).toThrow(ErroMensagemPermanente);
      },
    );
  });

  describe('validarSegundoPagamento', () => {
    it.each([[undefined], [''], ['  ']])(
      'recusa o segundo pagamento sem orderId (%p)',
      (orderId) => {
        expect(() => validarSegundoPagamento(orderId)).toThrow(
          ErroMensagemPermanente,
        );
      },
    );

    it('aceita o segundo pagamento com orderId', () => {
      expect(() => validarSegundoPagamento('ORD-2')).not.toThrow();
    });
  });

  describe('validarPagamentoLegitimoSemEstorno', () => {
    it('recusa o pagamento legítimo de order com estorno de segundo pagamento', () => {
      expect(() => validarPagamentoLegitimoSemEstorno(true)).toThrow(
        ErroMensagemPermanente,
      );
    });

    it('aceita o pagamento legítimo de order sem estorno de segundo pagamento', () => {
      expect(() => validarPagamentoLegitimoSemEstorno(false)).not.toThrow();
    });
  });
});
