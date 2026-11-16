import { generateKeyPairSync, randomBytes } from 'node:crypto';

/** Par RSA e tokens internos só para testes locais e CI — nunca produção. */
export function garantirCredenciaisRs256Descartaveis(): void {
  if (!process.env.JWT_PRIVATE_KEY?.trim()) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
  }

  if (!process.env.JWT_ISSUER?.trim()) {
    process.env.JWT_ISSUER = 'tech-challenge-auth';
  }
  if (!process.env.JWT_AUDIENCE?.trim()) {
    process.env.JWT_AUDIENCE = 'tech-challenge-api';
  }

  if (!process.env.TOKEN_BILLING_OS?.trim()) {
    process.env.TOKEN_BILLING_OS = `billing-os-ci-${randomBytes(16).toString('hex')}`;
  }
  if (!process.env.TOKEN_EXECUTION_OS?.trim()) {
    process.env.TOKEN_EXECUTION_OS = `execution-os-ci-${randomBytes(16).toString('hex')}`;
  }
  if (!process.env.TOKEN_AUTH_CPF_OS?.trim()) {
    process.env.TOKEN_AUTH_CPF_OS = `auth-cpf-os-ci-${randomBytes(16).toString('hex')}`;
  }

  delete process.env.JWT_SECRET;
}
