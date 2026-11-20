export class ConfiguracaoOsInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ConfiguracaoOsInvalidaError';
  }
}
