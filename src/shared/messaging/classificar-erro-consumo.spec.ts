import { classificarErroConsumo } from './classificar-erro-consumo';
import {
  ConteudoMensagemDivergenteError,
  ErroMensagemPermanente,
  ErroMensagemTransitoria,
} from './domain/mensageria.errors';
import { EnvelopeMensagemInvalidoError } from './validar-envelope';

describe('classificarErroConsumo', () => {
  it('classifica erros permanentes', () => {
    expect(classificarErroConsumo(new EnvelopeMensagemInvalidoError('x'))).toBe(
      'permanente',
    );
    expect(
      classificarErroConsumo(new ConteudoMensagemDivergenteError('id')),
    ).toBe('permanente');
    expect(classificarErroConsumo(new ErroMensagemPermanente('x'))).toBe(
      'permanente',
    );
  });

  it('classifica erros transitórios', () => {
    expect(classificarErroConsumo(new ErroMensagemTransitoria('x'))).toBe(
      'transitorio',
    );
    expect(classificarErroConsumo(new Error('falha'))).toBe('transitorio');
  });
});
