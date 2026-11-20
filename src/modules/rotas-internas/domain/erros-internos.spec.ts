import {
  ClienteNaoEncontradoInternoError,
  ConteudoDivergenteInternoError,
  EstoqueInsuficienteInternoError,
  EstadoIncompativelInternaError,
  ItemInvalidoInternoError,
  OsEmCancelamentoInternaError,
  ReservaDuplicadaInternaError,
  RodadaObsoletaInternaError,
} from './erros-internos';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';

describe('erros-internos', () => {
  it('expõe codigos do contrato', () => {
    expect(new RodadaObsoletaInternaError(2).codigo).toBe('RODADA_OBSOLETA');
    expect(new OsEmCancelamentoInternaError().codigo).toBe(
      'OS_EM_CANCELAMENTO',
    );
    expect(
      new EstadoIncompativelInternaError('x', StatusOS.RECEBIDA).detalhes
        .status,
    ).toBe(StatusOS.RECEBIDA);
    expect(new ConteudoDivergenteInternoError().codigo).toBe(
      'CONTEUDO_DIVERGENTE',
    );
    expect(new ItemInvalidoInternoError('i1').detalhes.itemId).toBe('i1');
    expect(
      new EstoqueInsuficienteInternoError([
        { pecaId: 'p1', disponivelAtual: 0, solicitado: 2 },
      ]).codigo,
    ).toBe('ESTOQUE_INSUFICIENTE');
    expect(new ReservaDuplicadaInternaError().statusHttp).toBe(409);
    expect(new ClienteNaoEncontradoInternoError().statusHttp).toBe(404);
  });
});
