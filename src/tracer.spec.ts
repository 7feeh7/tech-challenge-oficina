import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('tracer (dd-trace)', () => {
  it('não registra o CPF da query string em http.url do span', () => {
    const resultado = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        resolve(__dirname, '../test/helpers/servidor-apm.fixture.ts'),
      ],
      {
        encoding: 'utf-8',
        timeout: 60_000,
        env: { ...process.env, DD_TRACE_STARTUP_LOGS: 'false' },
      },
    );

    const urlRegistrada = /URL_REGISTRADA=(.*)/.exec(resultado.stdout)?.[1];
    expect(urlRegistrada).toBeDefined();
    expect(urlRegistrada).toContain('/internal/clientes?');
    expect(urlRegistrada).toContain('outro=1');
    expect(urlRegistrada).toContain('<redacted>');
    expect(urlRegistrada).not.toContain('12345678901');
  });
});
