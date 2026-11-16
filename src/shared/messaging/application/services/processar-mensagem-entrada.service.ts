import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ContextoTransacao,
  UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { UNIT_OF_WORK } from '@/shared/database/unit-of-work.port';
import { correlationIdStorage } from '@/shared/http/correlation-id.context';
import { ConteudoMensagemDivergenteError } from '../../domain/mensageria.errors';
import type { EnvelopeMensagem } from '../../envelope';
import { hashEnvelope } from '../../hash-envelope';
import {
  EnvelopeMensagemInvalidoError,
  validarEnvelopeBase,
} from '../../validar-envelope';
import type { MensagemProcessadaGateway } from '../ports/mensagem-processada.gateway';
import { MENSAGEM_PROCESSADA_GATEWAY } from '../ports/tokens';
import { RoteadorProcessadoresMensagemService } from './roteador-processadores-mensagem.service';

@Injectable()
export class ProcessarMensagemEntradaService {
  private readonly logger = new Logger(ProcessarMensagemEntradaService.name);

  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: UnitOfWork,
    @Inject(MENSAGEM_PROCESSADA_GATEWAY)
    private readonly mensagensProcessadas: MensagemProcessadaGateway,
    private readonly roteador: RoteadorProcessadoresMensagemService,
  ) {}

  async executar(corpoMensagem: string): Promise<void> {
    let envelopeBruto: unknown;
    try {
      envelopeBruto = JSON.parse(corpoMensagem) as unknown;
    } catch {
      throw new EnvelopeMensagemInvalidoError(
        'Corpo da mensagem não é JSON válido.',
      );
    }
    validarEnvelopeBase(envelopeBruto);
    const envelope = envelopeBruto;
    const hash = hashEnvelope(envelope);

    await correlationIdStorage.run(
      { correlationId: envelope.correlationId },
      async () => {
        await this.unitOfWork.executar(async (contexto) => {
          await this.processarNaTransacao(contexto, envelope, hash);
        });
      },
    );
  }

  private async processarNaTransacao(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    hash: string,
  ): Promise<void> {
    const jaProcessada = await this.mensagensProcessadas.jaProcessada(
      contexto,
      envelope.eventId,
    );
    if (jaProcessada) {
      const hashExistente = await this.mensagensProcessadas.buscarHash(
        contexto,
        envelope.eventId,
      );
      if (hashExistente && hashExistente !== hash) {
        throw new ConteudoMensagemDivergenteError(envelope.eventId);
      }
      this.logger.debug(
        `Mensagem ${envelope.eventId} já processada; efeito ignorado.`,
      );
      return;
    }

    await this.roteador.processar(contexto, envelope);
    await this.mensagensProcessadas.registrar(contexto, envelope.eventId, hash);
  }
}
