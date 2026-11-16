import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';

export interface MensagemProcessadaGateway {
  jaProcessada(contexto: ContextoTransacao, eventId: string): Promise<boolean>;
  registrar(
    contexto: ContextoTransacao,
    eventId: string,
    hashConteudo: string,
  ): Promise<void>;
  buscarHash(
    contexto: ContextoTransacao,
    eventId: string,
  ): Promise<string | null>;
}
