import { Inject, Injectable } from '@nestjs/common';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { ErroMensagemPermanente } from '../../domain/mensageria.errors';
import type { EnvelopeMensagem } from '../../envelope';
import type { ProcessadorMensagem } from '../ports/processador-mensagem.port';
import { PROCESSADORES_MENSAGEM } from '../ports/tokens';

@Injectable()
export class RoteadorProcessadoresMensagemService {
  private readonly porTipo: Map<string, ProcessadorMensagem>;

  constructor(
    @Inject(PROCESSADORES_MENSAGEM)
    processadores: ProcessadorMensagem[],
  ) {
    this.porTipo = new Map(processadores.map((p) => [p.eventType, p]));
  }

  async processar(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
  ): Promise<void> {
    const processador = this.porTipo.get(envelope.eventType);
    if (!processador) {
      throw new ErroMensagemPermanente(
        `Tipo de mensagem sem processador registrado: ${envelope.eventType}.`,
      );
    }
    await processador.processar(contexto, envelope);
  }
}
