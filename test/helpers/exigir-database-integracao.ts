/**
 * Integração exige PostgreSQL real: ausência ou falha de conexão deve falhar a suíte.
 */
export function exigirDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL é obrigatória para testes de integração (configure PostgreSQL acessível; em CI a suíte deve falhar sem banco).',
    );
  }
  return url;
}

export async function verificarConexaoPostgres(
  consulta: () => Promise<unknown>,
): Promise<void> {
  try {
    await consulta();
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    throw new Error(
      `Não foi possível usar o PostgreSQL configurado em DATABASE_URL: ${msg}`,
      { cause: erro },
    );
  }
}
