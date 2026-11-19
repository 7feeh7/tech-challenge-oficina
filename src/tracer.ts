import tracer from 'dd-trace';
import { REGEX_OFUSCACAO_QUERY_STRING_APM } from './shared/observability/ofuscacao-query-string-apm';

const service = process.env.DD_SERVICE ?? 'oficina-api';
const env = process.env.DD_ENV ?? process.env.NODE_ENV ?? 'development';
const version =
  process.env.DD_VERSION ?? process.env.npm_package_version ?? '0.0.1';

tracer.init({
  service,
  env,
  version,
  logInjection: true,
  runtimeMetrics: process.env.DD_RUNTIME_METRICS !== 'false',
  profiling: process.env.DD_PROFILING === 'true',
  appsec: false,
});

// `tracer.init` do dd-trace 6.x ignora `queryStringObfuscation`: a opção só vale
// na configuração do plugin http (ou na variável DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP).
tracer.use('http', {
  server: { queryStringObfuscation: REGEX_OFUSCACAO_QUERY_STRING_APM },
});

export default tracer;
