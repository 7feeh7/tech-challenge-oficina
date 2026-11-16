import {
  calcularBloqueadoAteRetentativaOutbox,
  calcularEsperaRetentativaOutbox,
} from './calcular-espera-retentativa-outbox';

describe('calcularEsperaRetentativaOutbox', () => {
  it('dobra a espera a cada tentativa até o teto', () => {
    expect(calcularEsperaRetentativaOutbox(1, 1000, 30_000)).toBe(1000);
    expect(calcularEsperaRetentativaOutbox(2, 1000, 30_000)).toBe(2000);
    expect(calcularEsperaRetentativaOutbox(3, 1000, 30_000)).toBe(4000);
    expect(calcularEsperaRetentativaOutbox(10, 1000, 30_000)).toBe(30_000);
  });

  it('calcula bloqueado_ate a partir do instante informado', () => {
    const agora = new Date('2026-11-16T12:00:00.000Z');
    const bloqueado = calcularBloqueadoAteRetentativaOutbox(
      3,
      1000,
      30_000,
      agora,
    );
    expect(bloqueado.toISOString()).toBe('2026-11-16T12:00:04.000Z');
  });
});
