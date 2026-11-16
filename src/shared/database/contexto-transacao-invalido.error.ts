export class ContextoTransacaoInvalidoError extends Error {
  constructor() {
    super(
      'Contexto de transação inválido: esperado PrismaContextoTransacao dentro do Unit of Work.',
    );
    this.name = 'ContextoTransacaoInvalidoError';
  }
}
