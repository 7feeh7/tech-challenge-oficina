import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DomainExceptionFilter } from './domain-exception.filter';
import { EstoqueInsuficienteReservaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ErroNegocioInternoError } from '@/modules/rotas-internas/domain/erro-negocio-interno.error';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import {
  DomainConflictError,
  DomainNotFoundError,
  DomainUnauthorizedError,
  DomainValidationError,
} from '../exceptions/domain.error';
import { ConteudoIdempotenciaDivergenteError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';

describe('DomainExceptionFilter — contrato interno', () => {
  const reply = jest.fn();
  const host = {
    switchToHttp: () => ({ getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;

  const filtro = new DomainExceptionFilter(
    { httpAdapter: { reply } } as unknown as HttpAdapterHost,
    { recordFalhaTransicao: jest.fn() } as unknown as OsMetricsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('traduz ErroNegocioInternoError para codigo/mensagem/detalhes', () => {
    filtro.catch(
      new ErroNegocioInternoError('X', 'msg', HttpStatus.CONFLICT, { a: 1 }),
      host,
    );
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { codigo: 'X', mensagem: 'msg', detalhes: { a: 1 } },
      HttpStatus.CONFLICT,
    );
  });

  it('mantém mapeamento padrão para DomainNotFoundError', () => {
    class ErroNaoEncontrado extends DomainNotFoundError {
      constructor() {
        super('não achou');
      }
    }
    filtro.catch(new ErroNaoEncontrado(), host);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'não achou' }),
      404,
    );
  });

  it('traduz DomainValidationError em 400', () => {
    class ErroValidacao extends DomainValidationError {
      constructor() {
        super('inválido');
      }
    }
    filtro.catch(new ErroValidacao(), host);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'inválido' }),
      400,
    );
  });

  it('traduz DomainConflictError em 409', () => {
    class ErroConflito extends DomainConflictError {
      constructor() {
        super('conflito');
      }
    }
    filtro.catch(new ErroConflito(), host);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'conflito' }),
      409,
    );
  });

  it('traduz DomainUnauthorizedError em 401', () => {
    class ErroAuth extends DomainUnauthorizedError {
      constructor() {
        super('negado');
      }
    }
    filtro.catch(new ErroAuth(), host);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'negado' }),
      401,
    );
  });

  it('traduz ConteudoIdempotenciaDivergenteError', () => {
    filtro.catch(new ConteudoIdempotenciaDivergenteError(), host);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ codigo: 'CONTEUDO_DIVERGENTE' }),
      409,
    );
  });

  it('traduz EstoqueInsuficienteReservaError para ESTOQUE_INSUFICIENTE', () => {
    filtro.catch(
      new EstoqueInsuficienteReservaError([
        { pecaId: 'p1', disponivelAtual: 1, solicitado: 2 },
      ]),
      host,
    );
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ codigo: 'ESTOQUE_INSUFICIENTE' }),
      409,
    );
  });
});
