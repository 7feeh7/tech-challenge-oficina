export interface MensagemFilaRecebida {
  corpo: string;
  receiptHandle: string;
}

export interface FilaMensagensGateway {
  receber(
    filaUrl: string,
    quantidadeMaxima?: number,
  ): Promise<MensagemFilaRecebida[]>;
  confirmar(filaUrl: string, receiptHandle: string): Promise<void>;
  enviar(
    filaUrl: string,
    envelope: unknown,
    correlationId: string,
  ): Promise<void>;
}
