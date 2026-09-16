const SENSITIVE_KEYS =
  /authorization|jwt|senha|password|secret|token|api[_-]?key|cpf|cnpj|email|body|cookie/i;

const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function maskCpf(value: string): string {
  return value.replace(CPF_PATTERN, (cpf) => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return '[cpf-redacted]';
    return `***.***.***-${digits.slice(-2)}`;
  });
}

export function maskEmail(value: string): string {
  return value.replace(EMAIL_PATTERN, (email) => {
    const [local, domain] = email.split('@');
    if (!domain) return '[email-redacted]';
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
  });
}

export function sanitizeString(value: string): string {
  return maskEmail(
    maskCpf(value.replace(BEARER_PATTERN, 'Bearer [redacted]')),
  ).replace(JWT_PATTERN, '[jwt-redacted]');
}

export function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeObject(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = sanitizeValue(value);
  }

  return output;
}
