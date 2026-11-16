import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type { EnvelopeMensagem } from '../../envelope';

export interface ProcessadorMensagem {
  readonly eventType: string;
  processar(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
  ): Promise<void>;
}
