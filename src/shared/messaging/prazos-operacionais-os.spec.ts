import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITE_REIVINDICACAO_MS } from '@/modules/coordenacao-saga/infra/persistence/prisma-consulta-prazo-ordem.gateway';

/**
 * Pior caso dos processadores do OS e conferência dos valores adotados nos arquivos de
 * implantação. As fórmulas e a tabela comentada estão em docs/tempos-processadores-os.md.
 */

const RAIZ_DO_REPOSITORIO = resolve(__dirname, '../../..');

const MARGEM_MS = 30_000;
// `keepAliveTimeout` padrão do Fastify 5, medido no Execution (docs/prazos-operacionais.md).
const FECHAMENTO_HTTP_MS = 72_000;
// ProcessarMensagemEntradaService repete a transação uma vez em caso de P2002.
const EXECUCOES_DA_TRANSACAO_POR_MENSAGEM = 2;

interface ParametrosDeTempo {
  esperaConexaoMs: number;
  transacaoMs: number;
  operacaoAwsMs: number;
  persistenciaPublicadorMs: number;
  loteConsumidor: number;
  lotePublicador: number;
  loteVerificador: number;
}

function calcularPiorCaso(parametros: ParametrosDeTempo) {
  const transacao = parametros.esperaConexaoMs + parametros.transacaoMs;
  const mensagemConsumidor =
    EXECUCOES_DA_TRANSACAO_POR_MENSAGEM * transacao +
    2 * parametros.operacaoAwsMs; // envio à DLQ + confirmação
  const loteConsumidor = parametros.loteConsumidor * mensagemConsumidor;
  const cicloConsumidor = parametros.operacaoAwsMs + loteConsumidor;

  const gravacaoPublicador =
    parametros.esperaConexaoMs + parametros.persistenciaPublicadorMs;
  // envio + confirmação que falha + liberação depois da falha
  const itemPublicador = parametros.operacaoAwsMs + 2 * gravacaoPublicador;
  const loteSobPosse =
    gravacaoPublicador + parametros.lotePublicador * itemPublicador;
  const cicloPublicador = loteSobPosse + gravacaoPublicador; // + recordOutboxBacklog

  const reivindicacaoVerificador =
    parametros.esperaConexaoMs + LIMITE_REIVINDICACAO_MS;
  const cicloVerificador =
    reivindicacaoVerificador + parametros.loteVerificador * transacao;

  const drenagem = loteConsumidor + cicloPublicador + cicloVerificador;
  const encerramento = drenagem + FECHAMENTO_HTTP_MS + MARGEM_MS;

  return {
    transacao,
    mensagemConsumidor,
    loteConsumidor,
    cicloConsumidor,
    gravacaoPublicador,
    itemPublicador,
    loteSobPosse,
    cicloPublicador,
    cicloVerificador,
    drenagem,
    encerramento,
  };
}

const lerArquivo = (caminho: string): string =>
  readFileSync(resolve(RAIZ_DO_REPOSITORIO, caminho), 'utf-8');

function lerNumero(texto: string, padrao: RegExp, origem: string): number {
  const encontrado = padrao.exec(texto);
  if (!encontrado) {
    throw new Error(`Valor não encontrado em ${origem}: ${padrao}`);
  }
  return Number(encontrado[1]);
}

const configMap = lerArquivo('k8s/configmap.yaml');
const envExample = lerArquivo('.env.example');
const deployment = lerArquivo('k8s/deployment.yaml');
const variaveisTerraform = lerArquivo('terraform/variables.tf');

const doConfigMap = (chave: string): number =>
  lerNumero(
    configMap,
    new RegExp(`^\\s+${chave}:\\s*"(\\d+)"`, 'm'),
    `k8s/configmap.yaml (${chave})`,
  );

const doEnvExample = (chave: string): number =>
  lerNumero(
    envExample,
    new RegExp(`^${chave}=(\\d+)\\s*$`, 'm'),
    `.env.example (${chave})`,
  );

const CHAVES_DE_TEMPO = [
  'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
  'DATABASE_TRANSACTION_TIMEOUT_MS',
  'SQS_OPERATION_DEADLINE_MS',
  'SNS_OPERATION_DEADLINE_MS',
  'SQS_CONSUMER_LOTE',
  'OUTBOX_PUBLISHER_LOTE',
  'OUTBOX_PERSISTENCIA_MS',
  'OUTBOX_REIVINDICACAO_MS',
  'PRAZO_REFERENCIA_VERIFICADOR_LOTE',
  'PRAZO_REFERENCIA_REIVINDICACAO_MS',
] as const;

describe('prazos operacionais do OS', () => {
  const parametrosAdotados: ParametrosDeTempo = {
    esperaConexaoMs: doConfigMap('DATABASE_POOL_CONNECTION_TIMEOUT_MS'),
    transacaoMs: doConfigMap('DATABASE_TRANSACTION_TIMEOUT_MS'),
    operacaoAwsMs: Math.max(
      doConfigMap('SQS_OPERATION_DEADLINE_MS'),
      doConfigMap('SNS_OPERATION_DEADLINE_MS'),
    ),
    persistenciaPublicadorMs: doConfigMap('OUTBOX_PERSISTENCIA_MS'),
    loteConsumidor: doConfigMap('SQS_CONSUMER_LOTE'),
    lotePublicador: doConfigMap('OUTBOX_PUBLISHER_LOTE'),
    loteVerificador: doConfigMap('PRAZO_REFERENCIA_VERIFICADOR_LOTE'),
  };
  const piorCaso = calcularPiorCaso(parametrosAdotados);

  it('calcula o pior caso com os valores adotados (tabela de docs/tempos-processadores-os.md)', () => {
    expect(piorCaso).toEqual({
      transacao: 20_000,
      mensagemConsumidor: 130_000,
      loteConsumidor: 390_000,
      cicloConsumidor: 435_000,
      gravacaoPublicador: 15_000,
      itemPublicador: 75_000,
      loteSobPosse: 390_000,
      cicloPublicador: 405_000,
      cicloVerificador: 115_000,
      drenagem: 910_000,
      encerramento: 1_012_000,
    });
  });

  it('a posse do publicador cobre o lote inteiro com 30 s de margem', () => {
    expect(doConfigMap('OUTBOX_REIVINDICACAO_MS')).toBeGreaterThanOrEqual(
      piorCaso.loteSobPosse + MARGEM_MS,
    );
  });

  it('a posse do verificador de prazo cobre o lote inteiro com 30 s de margem', () => {
    expect(
      doConfigMap('PRAZO_REFERENCIA_REIVINDICACAO_MS'),
    ).toBeGreaterThanOrEqual(piorCaso.cicloVerificador + MARGEM_MS);
  });

  it('o terminationGracePeriodSeconds cobre o encerramento com margem', () => {
    const graceSegundos = lerNumero(
      deployment,
      /terminationGracePeriodSeconds:\s*(\d+)/,
      'k8s/deployment.yaml',
    );
    expect(graceSegundos * 1000).toBeGreaterThanOrEqual(piorCaso.encerramento);
  });

  it('a visibilidade da os-in (Terraform) cobre o lote do consumidor com 30 s de margem', () => {
    const bloco = variaveisTerraform.slice(
      variaveisTerraform.indexOf('variable "sqs_visibility_timeout_seconds"'),
    );
    const padrao = lerNumero(
      bloco,
      /default\s*=\s*(\d+)/,
      'terraform/variables.tf (default)',
    );
    const minimoValidado = lerNumero(
      bloco,
      />=\s*(\d+)\s*&&/,
      'terraform/variables.tf (validation)',
    );
    const minimoCalculadoSegundos =
      (piorCaso.loteConsumidor + MARGEM_MS) / 1000;

    expect(minimoValidado).toBe(minimoCalculadoSegundos);
    expect(padrao).toBeGreaterThanOrEqual(minimoCalculadoSegundos);
  });

  it('o .env.example usa os mesmos valores de tempo do ConfigMap', () => {
    for (const chave of CHAVES_DE_TEMPO) {
      expect({ chave, valor: doEnvExample(chave) }).toEqual({
        chave,
        valor: doConfigMap(chave),
      });
    }
  });
});
