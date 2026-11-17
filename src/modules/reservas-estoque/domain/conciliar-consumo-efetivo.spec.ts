import { conciliarConsumoEfetivo } from './conciliar-consumo-efetivo';
import { TipoDivergenciaConsumo } from './tipo-divergencia-consumo';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

describe('conciliarConsumoEfetivo', () => {
  const existe = (id: string) => id === P1 || id === P2;

  it('consumo igual não abre pendência', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 2 }],
      [{ itemId: P1, quantidade: 2 }],
      [],
      existe,
    );
    expect(r.divergenciasInventario).toHaveLength(0);
    expect(r.itensAutomaticos).toEqual([{ itemId: P1, quantidade: 2 }]);
  });

  it('consumo inferior informativo sem pendência', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 3 }],
      [{ itemId: P1, quantidade: 1 }],
      [
        {
          itemId: P1,
          quantidadePrevista: 3,
          quantidadeUtilizada: 1,
          tipo: TipoDivergenciaConsumo.CONSUMO_INFERIOR,
        },
      ],
      existe,
    );
    expect(r.divergenciasInventario).toHaveLength(0);
  });

  it('excesso abre pendência e baixa só reservado', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 2 }],
      [{ itemId: P1, quantidade: 5 }],
      [],
      existe,
    );
    expect(r.divergenciasInventario.length).toBe(1);
    expect(r.itensAutomaticos).toEqual([{ itemId: P1, quantidade: 2 }]);
  });

  it('peça fora da reserva abre pendência', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 1 }],
      [{ itemId: P2, quantidade: 1 }],
      [
        {
          itemId: P2,
          quantidadePrevista: 0,
          quantidadeUtilizada: 1,
          tipo: TipoDivergenciaConsumo.FORA_DA_LISTA,
        },
      ],
      existe,
    );
    expect(r.divergenciasInventario.length).toBe(1);
    expect(r.itensAutomaticos).toHaveLength(0);
  });

  it('CONSUMO_ZERO informativo sem pendência', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 2 }],
      [],
      [
        {
          itemId: P1,
          quantidadePrevista: 2,
          quantidadeUtilizada: 0,
          tipo: TipoDivergenciaConsumo.CONSUMO_ZERO,
        },
      ],
      existe,
    );
    expect(r.divergenciasInventario).toHaveLength(0);
    expect(r.itensAutomaticos).toHaveLength(0);
  });

  it('UUID inexistente no catálogo abre pendência', () => {
    const desconhecida = '99999999-9999-4999-8999-999999999999';
    const r = conciliarConsumoEfetivo(
      [],
      [{ itemId: desconhecida, quantidade: 1 }],
      [],
      () => false,
    );
    expect(r.divergenciasInventario.length).toBe(1);
  });

  it('divergência sem tipo mas com motivo OS ainda pode exigir pendência', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 1 }],
      [{ itemId: P1, quantidade: 2 }],
      [],
      existe,
    );
    expect(r.divergenciasInventario.length).toBeGreaterThan(0);
  });

  it('mensagem legada sem tipo em FORA_DA_LISTA respeita conciliação', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 1 }],
      [{ itemId: P2, quantidade: 1 }],
      [
        {
          itemId: P2,
          quantidadePrevista: 0,
          quantidadeUtilizada: 1,
        },
      ],
      existe,
    );
    expect(r.divergenciasInventario.length).toBe(1);
  });

  it('motivo com peça desconhecida exige pendência', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 1 }],
      [{ itemId: P1, quantidade: 1 }],
      [
        {
          itemId: P1,
          quantidadePrevista: 1,
          quantidadeUtilizada: 1,
          motivo: 'peça desconhecida no catálogo',
        },
      ],
      existe,
    );
    expect(r.divergenciasAuditoria.length).toBe(1);
    expect(r.divergenciasInventario.length).toBe(0);
  });

  it('itemId inválido vira divergência sem cast UUID', () => {
    const r = conciliarConsumoEfetivo(
      [{ pecaId: P1, quantidadeReservada: 1 }],
      [{ itemId: 'nao-uuid', quantidade: 1 }],
      [],
      () => false,
    );
    expect(r.divergenciasInventario.length).toBe(1);
    expect(r.itensAutomaticos).toHaveLength(0);
  });
});
