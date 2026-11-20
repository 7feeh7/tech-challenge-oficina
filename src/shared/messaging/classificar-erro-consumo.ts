import { EnvelopeMensagemInvalidoError } from './validar-envelope';
import {
  ConteudoMensagemDivergenteError,
  ErroMensagemPermanente,
} from './domain/mensageria.errors';

export type ClassificacaoErroConsumo = 'permanente' | 'transitorio';

export function classificarErroConsumo(
  erro: unknown,
): ClassificacaoErroConsumo {
  if (
    erro instanceof EnvelopeMensagemInvalidoError ||
    erro instanceof ConteudoMensagemDivergenteError ||
    erro instanceof ErroMensagemPermanente
  ) {
    return 'permanente';
  }
  return 'transitorio';
}
