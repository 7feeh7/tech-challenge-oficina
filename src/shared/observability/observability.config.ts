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
} as const;
