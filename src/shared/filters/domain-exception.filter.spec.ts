import { ArgumentsHost } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  CredenciaisInvalidasError,
  EmailUsuarioJaExisteError,
  NomeUsuarioInvalidoError,
  UsuarioNaoEncontradoError,
} from '@/modules/usuarios/domain/errors/usuario.errors';
import { DomainExceptionFilter } from './domain-exception.filter';

describe('DomainExceptionFilter', () => {
  const reply = jest.fn();
  const response = Symbol('response');
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  const filter = new DomainExceptionFilter({
    httpAdapter: { reply },
  } as unknown as HttpAdapterHost);

  const statusRespondido = () => reply.mock.calls[0][2] as number;
  const corpoRespondido = () => reply.mock.calls[0][1] as { message: string };

  beforeEach(() => jest.clearAllMocks());

  it('traduz erro de validação para 400', () => {
    filter.catch(new NomeUsuarioInvalidoError(), host);

    expect(statusRespondido()).toBe(400);
    expect(corpoRespondido().message).toBe(
      'O nome do usuário deve possuir entre 3 e 100 caracteres.',
    );
  });

  it('traduz erro de recurso inexistente para 404', () => {
    filter.catch(new UsuarioNaoEncontradoError('uuid-u1'), host);

    expect(statusRespondido()).toBe(404);
    expect(corpoRespondido().message).toContain('uuid-u1');
  });

  it('traduz erro de conflito para 409', () => {
    filter.catch(new EmailUsuarioJaExisteError(), host);

    expect(statusRespondido()).toBe(409);
  });

  it('traduz erro de credenciais para 401', () => {
    filter.catch(new CredenciaisInvalidasError(), host);

    expect(statusRespondido()).toBe(401);
    expect(corpoRespondido().message).toBe('Credenciais inválidas.');
  });
});
