import { ConfiguracaoOsInvalidaError } from './configuracao-os-invalida.error';

export type AmbienteConfiguracao = Record<string, string | undefined>;

const MARCADOR_CHAVE_PRIVADA = 'BEGIN PRIVATE KEY';
const MARCADOR_CHAVE_PUBLICA = 'BEGIN PUBLIC KEY';

function texto(
  ambiente: AmbienteConfiguracao,
  chave: string,
  padrao: string,
): string {
  const bruto = ambiente[chave]?.trim();
  return bruto && bruto.length > 0 ? bruto : padrao;
}

function exigirPreenchido(
  ambiente: AmbienteConfiguracao,
  chave: string,
  rotulo: string,
): string {
  const valor = ambiente[chave]?.trim();
  if (!valor) {
    throw new ConfiguracaoOsInvalidaError(
      `${rotulo}: variável ${chave} ausente ou vazia.`,
    );
  }
  return valor;
}

function exigirChavePem(valor: string, chave: string, marcador: string): void {
  if (!valor.includes(marcador)) {
    throw new ConfiguracaoOsInvalidaError(
      `${chave} não contém PEM válido (esperado "${marcador}").`,
    );
  }
}

function recusarLegadoHs256(ambiente: AmbienteConfiguracao): void {
  if (ambiente.JWT_SECRET?.trim()) {
    throw new ConfiguracaoOsInvalidaError(
      'JWT_SECRET não é mais suportado; use JWT_PRIVATE_KEY e JWT_PUBLIC_KEY (RS256).',
    );
  }
}

// Token igual em duas relações deixaria o chamador de uma rota passar na da outra,
// então a checagem vale também fora de produção, onde os tokens são opcionais.
function recusarTokensDeRelacaoIguais(ambiente: AmbienteConfiguracao): void {
  const tokensConfigurados = [
    ambiente.TOKEN_BILLING_OS,
    ambiente.TOKEN_EXECUTION_OS,
    ambiente.TOKEN_AUTH_CPF_OS,
  ]
    .map((token) => token?.trim())
    .filter((token): token is string => Boolean(token));

  if (new Set(tokensConfigurados).size !== tokensConfigurados.length) {
    throw new ConfiguracaoOsInvalidaError(
      'Tokens de chamador interno devem ser distintos entre Billing, Execution e auth-cpf.',
    );
  }
}

/** Falha segura na inicialização em produção quando faltam chaves ou tokens internos. */
export function validarConfiguracaoOs(
  ambiente: AmbienteConfiguracao = process.env,
): void {
  recusarLegadoHs256(ambiente);
  recusarTokensDeRelacaoIguais(ambiente);

  const producao = texto(ambiente, 'NODE_ENV', 'development') === 'production';
  if (!producao) {
    return;
  }

  const privada = exigirPreenchido(
    ambiente,
    'JWT_PRIVATE_KEY',
    'Chave privada JWT',
  );
  const publica = exigirPreenchido(
    ambiente,
    'JWT_PUBLIC_KEY',
    'Chave pública JWT',
  );

  exigirChavePem(privada, 'JWT_PRIVATE_KEY', MARCADOR_CHAVE_PRIVADA);
  exigirChavePem(publica, 'JWT_PUBLIC_KEY', MARCADOR_CHAVE_PUBLICA);

  exigirPreenchido(ambiente, 'TOKEN_BILLING_OS', 'Token Billing → OS');
  exigirPreenchido(ambiente, 'TOKEN_EXECUTION_OS', 'Token Execution → OS');
  exigirPreenchido(ambiente, 'TOKEN_AUTH_CPF_OS', 'Token auth-cpf → OS');

  exigirPreenchido(ambiente, 'JWT_ISSUER', 'JWT_ISSUER');
  exigirPreenchido(ambiente, 'JWT_AUDIENCE', 'JWT_AUDIENCE');
}
