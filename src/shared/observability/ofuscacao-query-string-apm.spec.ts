import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  REGEX_OFUSCACAO_QUERY_STRING_APM,
  REGEX_PADRAO_DD_TRACE_6_25_0,
} from './ofuscacao-query-string-apm';

// Mesma aplicação do dd-trace: flags `gi` e troca do trecho casado.
const ofuscar = (
  queryString: string,
  regex = REGEX_OFUSCACAO_QUERY_STRING_APM,
) => queryString.replace(new RegExp(regex, 'gi'), '<redacted>');

const JWT_SOLTO =
  'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLWRlLXRlc3Rl';

const ENTRADAS_DE_CREDENCIAL = [
  'access_token=abc123',
  'refresh_token=abc123',
  'id_token=abc123',
  'token=abc123',
  'client_secret=abc123',
  'secret=abc123',
  'new_password=abc123',
  'old_password=abc123',
  'password=abc123',
  'passwd=abc123',
  'pwd=abc123',
  'consumer_key=abc123',
  'consumer_secret=abc123',
  'api_key=abc123',
  'apikey=abc123',
  'private_key=abc123',
  'access_key_id=abc123',
  'signature=abc123',
  'authorization=abc123',
  'authentication=abc123',
  `jwt=${JWT_SOLTO}`,
  `pagina=1&jwt=${JWT_SOLTO}&ordem=asc`,
  'authorization=bearer%20abc.def-ghi',
  'x=bearer abc123',
  `x=${JWT_SOLTO}`,
  `pagina=1&${JWT_SOLTO}`,
];

describe('regex de ofuscação da query string no APM', () => {
  describe('CPF', () => {
    it.each([
      ['cpf=12345678901', '<redacted>'],
      ['CPF=12345678901', '<redacted>'],
      ['cpf=123.456.789-01', '<redacted>'],
      ['cpf%3D12345678901', '<redacted>'],
      ['cpfCnpj=12345678901', '<redacted>'],
      ['outro=1&cpf=12345678901', 'outro=1&<redacted>'],
      ['cpf=12345678901&pagina=2', '<redacted>&pagina=2'],
      ['cpf=12345678901&cpf=98765432100', '<redacted>&<redacted>'],
    ])('ofusca o CPF em %s', (entrada, esperado) => {
      expect(ofuscar(entrada)).toBe(esperado);
    });
  });

  describe('credenciais', () => {
    it.each(ENTRADAS_DE_CREDENCIAL)('ofusca %s', (entrada) => {
      expect(ofuscar(entrada)).toContain('<redacted>');
      expect(ofuscar(entrada)).not.toContain('abc123');
      expect(ofuscar(entrada)).not.toContain('eyJ');
    });

    it('ofusca tudo que a regra padrão do dd-trace ofusca', () => {
      for (const entrada of ENTRADAS_DE_CREDENCIAL) {
        const ofuscadaPelaPadrao = ofuscar(
          entrada,
          REGEX_PADRAO_DD_TRACE_6_25_0,
        );
        if (ofuscadaPelaPadrao === entrada) continue;

        expect(ofuscar(entrada)).toBe(ofuscadaPelaPadrao);
      }
    });
  });

  it.each(['outro=1', 'pagina=2', 'pagina=1&ordem=asc', 'descpf=1'])(
    'preserva parâmetros inocentes em %s',
    (entrada) => {
      expect(ofuscar(entrada)).toBe(entrada);
    },
  );

  it('preserva os parâmetros inocentes ao lado do CPF', () => {
    expect(ofuscar('outro=1&cpf=12345678901&pagina=2')).toBe(
      'outro=1&<redacted>&pagina=2',
    );
  });

  describe('cópia da regra padrão', () => {
    it('é idêntica à regra do dd-trace instalado (rever a cópia ao atualizar o dd-trace)', () => {
      const pastaDoTracer = dirname(require.resolve('dd-trace'));
      const configuracoes = JSON.parse(
        readFileSync(
          join(
            pastaDoTracer,
            'packages/dd-trace/src/config/supported-configurations.json',
          ),
          'utf-8',
        ),
      ) as Record<string, any>;
      const entrada = (configuracoes.supportedConfigurations ?? configuracoes)
        .DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP[0];

      expect(REGEX_PADRAO_DD_TRACE_6_25_0).toBe(entrada.default);
    });
  });

  describe('desempenho com entrada longa (ReDoS)', () => {
    it.each([
      ['pares sem chave sensível', 'a=b&'.repeat(50_000)],
      ['prefixos de chave sensível sem valor', 'token'.repeat(50_000)],
      ['cpf repetido sem separador', 'cpf'.repeat(50_000)],
      ['espaços codificados', `x${'%20'.repeat(50_000)}`],
      ['valor longo de credencial', `token=${'a'.repeat(250_000)}`],
      ['JWT longo', `x=eyJ${'a'.repeat(100_000)}.eyJ${'b'.repeat(100_000)}`],
    ])('termina em tempo curto: %s', (_nome, entrada) => {
      const inicio = Date.now();

      ofuscar(entrada);

      expect(Date.now() - inicio).toBeLessThan(1_000);
    });
  });
});
