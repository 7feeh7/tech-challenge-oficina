import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Contrato REST interno v1', () => {
  const doc = readFileSync(
    join(__dirname, '../docs/contratos/rest-interno-os.md'),
    'utf8',
  );

  it('documenta as três rotas e Idempotency-Key', () => {
    expect(doc).toContain('POST /internal/ordens-servico/{id}/diagnostico');
    expect(doc).toContain('POST /internal/ordens-servico/{id}/reservas');
    expect(doc).toContain('GET /internal/clientes?cpf=');
    expect(doc).toContain('Idempotency-Key');
    expect(doc).toContain('RODADA_OBSOLETA');
    expect(doc).toContain('CLIENTE_NAO_ENCONTRADO');
  });
});
