import { Client } from 'pg';

/** Mantém transação aberta com bloqueio exclusivo na OS (testes de concorrência). */
export class SessaoBloqueioOrdemServico {
  private readonly client: Client;
  private aberta = false;

  constructor(
    databaseUrl: string,
    private readonly ordemServicoId: string,
  ) {
    this.client = new Client({ connectionString: databaseUrl });
  }

  async adquirir(): Promise<void> {
    await this.client.connect();
    await this.client.query('BEGIN');
    await this.client.query(
      'SELECT id FROM ordens_servico WHERE id = $1::uuid FOR UPDATE',
      [this.ordemServicoId],
    );
    this.aberta = true;
  }

  async liberar(): Promise<void> {
    if (!this.aberta) {
      return;
    }
    try {
      await this.client.query('COMMIT');
    } finally {
      this.aberta = false;
      await this.client.end();
    }
  }

  async descartar(): Promise<void> {
    if (!this.aberta) {
      try {
        await this.client.end();
      } catch {
        /* cliente já encerrado */
      }
      return;
    }
    try {
      await this.client.query('ROLLBACK');
    } finally {
      this.aberta = false;
      await this.client.end();
    }
  }
}
