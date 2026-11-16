export const OBSERVABILITY = {
  service: process.env.DD_SERVICE ?? 'oficina-api',
  env: process.env.DD_ENV ?? process.env.NODE_ENV ?? 'development',
  version: process.env.DD_VERSION ?? process.env.npm_package_version ?? '0.0.1',
} as const;

export const METRIC_NAMES = {
  osCriada: 'oficina.ordem_servico.criada',
  osTempoPorStatus: 'oficina.ordem_servico.tempo_por_status',
  osTransicaoFalha: 'oficina.ordem_servico.transicao_falha',
  integracaoFalha: 'oficina.integracao.falha',
  integracaoLatencia: 'oficina.integracao.latencia',
  outboxPendentes: 'oficina.outbox.pendentes',
  outboxIdadeMaisAntigaSegundos: 'oficina.outbox.idade_mais_antiga_segundos',
  outboxPublicacaoFalha: 'oficina.outbox.publicacao_falha',
  mensagemProcessada: 'oficina.mensagem.processada',
  mensagemErroConsumo: 'oficina.mensagem.erro_consumo',
} as const;
