import { sanitizeObject, sanitizeString } from './log-sanitizer';

describe('log-sanitizer', () => {
  it('remove authorization, jwt, senha e segredo dos metadados', () => {
    const sanitized = sanitizeObject({
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
      jwt: 'token-secreto',
      senha: '123456',
      secret: 'valor',
      apiKey: 'chave',
      mensagem: 'ok',
    });

    expect(sanitized.authorization).toBe('[redacted]');
    expect(sanitized.jwt).toBe('[redacted]');
    expect(sanitized.senha).toBe('[redacted]');
    expect(sanitized.secret).toBe('[redacted]');
    expect(sanitized.apiKey).toBe('[redacted]');
    expect(sanitized.mensagem).toBe('ok');
  });

  it('mascara CPF completo em strings', () => {
    expect(sanitizeString('cliente 123.456.789-01 autenticado')).toBe(
      'cliente ***.***.***-01 autenticado',
    );
  });

  it('mascara e-mail completo em strings', () => {
    expect(sanitizeString('contato joao.silva@oficina.com.br')).toBe(
      'contato jo***@oficina.com.br',
    );
  });

  it('remove bearer token de strings', () => {
    expect(sanitizeString('Authorization Bearer abc.def.ghi')).toBe(
      'Authorization Bearer [redacted]',
    );
  });
});
