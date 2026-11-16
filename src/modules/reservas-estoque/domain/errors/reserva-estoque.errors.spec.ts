import {
  ConteudoIdempotenciaDivergenteError,
  EstoqueInsuficienteReservaError,
  PendenciaInventarioJaResolvidaError,
  PendenciaInventarioNaoEncontradaError,
  ReservaJaProcessadaError,
} from './reserva-estoque.errors';

describe('ReservaEstoque errors', () => {
  it('expõe mensagens estáveis', () => {
    expect(
      new EstoqueInsuficienteReservaError([
        { pecaId: 'p', disponivelAtual: 0, solicitado: 1 },
      ]).message,
    ).toContain('insuficiente');
    expect(new ReservaJaProcessadaError().message).toContain('liberada');
    expect(new ConteudoIdempotenciaDivergenteError().message).toContain(
      'idempotência',
    );
    expect(new PendenciaInventarioNaoEncontradaError('x').message).toContain('x');
    expect(new PendenciaInventarioJaResolvidaError().message).toContain(
      'resolvida',
    );
  });
});