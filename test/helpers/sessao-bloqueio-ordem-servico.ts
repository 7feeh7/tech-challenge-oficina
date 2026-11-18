import { Client } from 'pg';

/** Mantém transação aberta com bloqueio exclusivo na OS (testes de concorrência). */
export class SessaoBloqueioOrdemServico {
  private readonly client: Client;
  private readonly databaseUrl: string;
  private aberta = false;
  private backendPid: number | null = null;

  constructor(
    databaseUrl: string,
    private readonly ordemServicoId: string,
  ) {
    this.databaseUrl = databaseUrl;
    this.client = new Client({ connectionString: databaseUrl });
  }

  async adquirir(): Promise<void> {
    await this.client.connect();
    await this.client.query('BEGIN');
    await this.client.query(
      'SELECT id FROM ordens_servico WHERE id = $1::uuid FOR UPDATE',
      [this.ordemServicoId],
    );
    const pidRow = await this.client.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );
    this.backendPid = pidRow.rows[0]?.pid ?? null;
    this.aberta = true;
  }

  /**
   * PIDs de negócio na disputa pelo bloqueio: espera direta (`pg_locks`) ou
   * cadeia transitiva (`pg_blocking_pids`) até o pid desta sessão.
   */
  async listarPidsDisputaPeloBloqueio(): Promise<number[]> {
    if (this.backendPid === null) {
      return [];
    }
    const observador = new Client({ connectionString: this.databaseUrl });
    await observador.connect();
    try {
      const { rows } = await observador.query<{ pid: number }>(
        `WITH RECURSIVE cadeia AS (
           SELECT a.pid
           FROM pg_stat_activity a
           WHERE a.pid <> $1::int
             AND $1::int = ANY(pg_blocking_pids(a.pid))
           UNION
           SELECT a.pid
           FROM pg_stat_activity a
           INNER JOIN cadeia c ON c.pid = ANY(pg_blocking_pids(a.pid))
           WHERE a.pid <> $1::int
         ),
         diretos_locks AS (
           SELECT DISTINCT blocked_locks.pid AS pid
           FROM pg_catalog.pg_locks blocked_locks
           JOIN pg_catalog.pg_locks blocking_locks
             ON blocking_locks.locktype = blocked_locks.locktype
             AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
             AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
             AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
             AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
             AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
             AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
             AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
             AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
             AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
             AND blocking_locks.pid <> blocked_locks.pid
           WHERE NOT blocked_locks.granted
             AND blocking_locks.granted
             AND blocking_locks.pid = $1::int
         )
         SELECT DISTINCT pid
         FROM (
           SELECT pid FROM cadeia
           UNION
           SELECT pid FROM diretos_locks
         ) aguardando
         ORDER BY pid`,
        [this.backendPid],
      );
      return rows.map((r) => r.pid);
    } finally {
      await observador.end();
    }
  }

  /** Backends de negócio aguardando este `FOR UPDATE` (`pg_locks` + `pg_blocking_pids`). */
  async contarBackendsAguardando(): Promise<number> {
    const pids = await this.listarPidsDisputaPeloBloqueio();
    return pids.length;
  }

  /**
   * Aguarda até `minimoAguardando` conexões de negócio estarem bloqueadas
   * pelo pid desta sessão, comprovando disputa real antes de `liberar()`.
   */
  async aguardarDisputaBloqueio(
    minimoAguardando: number,
    timeoutMs = 12_000,
  ): Promise<number[]> {
    for (let i = 0; i < 8; i++) {
      await new Promise<void>((r) => setImmediate(r));
    }
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      const pids = await this.listarPidsDisputaPeloBloqueio();
      if (pids.length >= minimoAguardando) {
        return pids;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    const observado = await this.listarPidsDisputaPeloBloqueio();
    throw new Error(
      `Disputa pelo bloqueio da OS não comprovada: mínimo ${minimoAguardando}, observado ${observado.length} pids [${observado.join(', ')}] (pid bloqueador ${this.backendPid})`,
    );
  }

  /**
   * Após nova operação disparada: exige PID de negócio na disputa que não
   * constava em `pidsReferencia` (inclui espera indireta na cadeia PG).
   */
  async aguardarAcrescimoDisputa(
    pidsReferencia: number[],
    timeoutMs = 12_000,
  ): Promise<number[]> {
    const referencia = new Set(pidsReferencia);
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      const pids = await this.listarPidsDisputaPeloBloqueio();
      if (pids.some((pid) => !referencia.has(pid))) {
        return pids;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    const observado = await this.listarPidsDisputaPeloBloqueio();
    throw new Error(
      `Segunda operação não entrou na disputa pelo bloqueio: referência [${pidsReferencia.join(', ')}], observado [${observado.join(', ')}] (pid bloqueador ${this.backendPid})`,
    );
  }

  async liberar(): Promise<void> {
    if (!this.aberta) {
      return;
    }
    try {
      await this.client.query('COMMIT');
    } finally {
      this.aberta = false;
      this.backendPid = null;
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
      this.backendPid = null;
      await this.client.end();
    }
  }
}
