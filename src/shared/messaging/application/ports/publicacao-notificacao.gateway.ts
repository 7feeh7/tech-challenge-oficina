export interface PublicacaoNotificacaoGateway {
  publicar(envelope: unknown, correlationId: string): Promise<void>;
}
