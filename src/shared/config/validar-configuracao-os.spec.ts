import { validarConfiguracaoOs } from './validar-configuracao-os';
import { ConfiguracaoOsInvalidaError } from './configuracao-os-invalida.error';
import { generateKeyPairSync } from 'node:crypto';

describe('validarConfiguracaoOs', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  it('não exige chaves fora de produção', () => {
    expect(() =>
      validarConfiguracaoOs({ NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  it('recusa JWT_SECRET legado', () => {
    expect(() =>
      validarConfiguracaoOs({
        NODE_ENV: 'development',
        JWT_SECRET: 'hs256',
      }),
    ).toThrow(ConfiguracaoOsInvalidaError);
  });

  it('exige par RS256 e tokens em produção', () => {
    expect(() =>
      validarConfiguracaoOs({
        NODE_ENV: 'production',
        JWT_PRIVATE_KEY: privateKey,
        JWT_PUBLIC_KEY: publicKey,
        JWT_ISSUER: 'tech-challenge-auth',
        JWT_AUDIENCE: 'tech-challenge-api',
        TOKEN_BILLING_OS: 't1',
        TOKEN_EXECUTION_OS: 't2',
        TOKEN_AUTH_CPF_OS: 't3',
      }),
    ).not.toThrow();
  });

  it('recusa tokens de chamador iguais em produção', () => {
    expect(() =>
      validarConfiguracaoOs({
        NODE_ENV: 'production',
        JWT_PRIVATE_KEY: privateKey,
        JWT_PUBLIC_KEY: publicKey,
        JWT_ISSUER: 'tech-challenge-auth',
        JWT_AUDIENCE: 'tech-challenge-api',
        TOKEN_BILLING_OS: 'mesmo',
        TOKEN_EXECUTION_OS: 'mesmo',
        TOKEN_AUTH_CPF_OS: 't3',
      }),
    ).toThrow(ConfiguracaoOsInvalidaError);
  });

  it('falha em produção com PEM inválido', () => {
    expect(() =>
      validarConfiguracaoOs({
        NODE_ENV: 'production',
        JWT_PRIVATE_KEY: 'nao-e-pem',
        JWT_PUBLIC_KEY: publicKey,
        TOKEN_BILLING_OS: 't1',
        TOKEN_EXECUTION_OS: 't2',
        TOKEN_AUTH_CPF_OS: 't3',
      }),
    ).toThrow(ConfiguracaoOsInvalidaError);
  });

  it('falha em produção sem chave privada', () => {
    expect(() =>
      validarConfiguracaoOs({
        NODE_ENV: 'production',
        JWT_PUBLIC_KEY: publicKey,
        TOKEN_BILLING_OS: 't1',
        TOKEN_EXECUTION_OS: 't2',
        TOKEN_AUTH_CPF_OS: 't3',
      }),
    ).toThrow(ConfiguracaoOsInvalidaError);
  });

  it('falha em produção sem JWT_ISSUER e JWT_AUDIENCE', () => {
    expect(() =>
      validarConfiguracaoOs({
        NODE_ENV: 'production',
        JWT_PRIVATE_KEY: privateKey,
        JWT_PUBLIC_KEY: publicKey,
        TOKEN_BILLING_OS: 't1',
        TOKEN_EXECUTION_OS: 't2',
        TOKEN_AUTH_CPF_OS: 't3',
      }),
    ).toThrow(ConfiguracaoOsInvalidaError);
  });
});
