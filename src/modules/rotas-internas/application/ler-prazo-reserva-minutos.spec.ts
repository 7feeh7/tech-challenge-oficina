import {
  lerPrazoReservaMinutos,
  PRAZO_RESERVA_MINUTOS_PADRAO,
} from './ler-prazo-reserva-minutos';

describe('lerPrazoReservaMinutos', () => {
  it('usa o padrão de 75 minutos quando a configuração está ausente', () => {
    expect(lerPrazoReservaMinutos(undefined)).toBe(75);
    expect(PRAZO_RESERVA_MINUTOS_PADRAO).toBe(75);
  });

  it('usa o valor configurado quando é um inteiro positivo', () => {
    expect(lerPrazoReservaMinutos('5')).toBe(5);
  });

  it.each(['abc', '', '0', '-10', '1.5', 'NaN', 'Infinity'])(
    'volta ao padrão quando o valor é inválido (%p)',
    (valorInvalido) => {
      expect(lerPrazoReservaMinutos(valorInvalido)).toBe(75);
    },
  );
});
