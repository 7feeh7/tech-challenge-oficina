import { ArgumentsHost } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ClienteJaExisteError } from '@/modules/clientes/domain/errors/cliente.errors';
import { TransicaoStatusInvalidaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
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

  const osMetrics = { recordTransicaoFalha: jest.fn() };
  const filter = new DomainExceptionFilter(
    { httpAdapter: { reply } } as unknown as HttpAdapterHost,
    osMetrics as never,
  );

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

  it('registra métrica em transição inválida e responde 400', () => {
    filter.catch(
      new TransicaoStatusInvalidaError(StatusOS.RECEBIDA, StatusOS.EM_EXECUCAO),
      host,
    );

    expect(osMetrics.recordTransicaoFalha).toHaveBeenCalled();
    expect(statusRespondido()).toBe(400);
  });

  it('traduz conflito de domínio genérico para 409', () => {
    filter.catch(new ClienteJaExisteError(), host);

    expect(statusRespondido()).toBe(409);
  });

  it('traduz erro de credenciais para 401', () => {
    filter.catch(new CredenciaisInvalidasError(), host);

    expect(statusRespondido()).toBe(401);
    expect(corpoRespondido().message).toBe('Credenciais inválidas.');
  });
});
