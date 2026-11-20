import { DomainValidationError } from '@/shared/exceptions/domain.error';

export class ConteudoMensagemDivergenteError extends DomainValidationError {
  constructor(eventId: string) {
    super(
      `Conteúdo divergente para eventId já processado: ${eventId} (CONTEUDO_DIVERGENTE).`,
    );
  }
}

export class ErroMensagemPermanente extends DomainValidationError {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

export class ErroMensagemTransitoria extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroMensagemTransitoria';
  }
}
