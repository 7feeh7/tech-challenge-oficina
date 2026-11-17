import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DomainExceptionFilter } from './domain-exception.filter';
import { EstoqueInsuficienteReservaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ErroNegocioInternoError } from '@/modules/rotas-internas/domain/erro-negocio-interno.error';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import { DomainNotFoundError } from '../exceptions/domain.error';

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
