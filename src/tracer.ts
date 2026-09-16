import tracer from 'dd-trace';

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

export default tracer;
