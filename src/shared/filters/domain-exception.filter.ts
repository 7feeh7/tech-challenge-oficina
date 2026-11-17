import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErroNegocioInternoError } from '@/modules/rotas-internas/domain/erro-negocio-interno.error';
import {
  DomainConflictError,
  DomainError,
  DomainNotFoundError,
  DomainUnauthorizedError,
  DomainValidationError,
} from '../exceptions/domain.error';
import { ConteudoIdempotenciaDivergenteError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { EstoqueInsuficienteReservaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import { registrarFalhaTransicaoSeAplicavel } from '@/shared/observability/registrar-falha-transicao';
import {
  ConteudoDivergenteInternoError,
  EstoqueInsuficienteInternoError,
} from '@/modules/rotas-internas/domain/erros-internos';

/**
 * Traduz erros de domínio em respostas HTTP. Mantém o núcleo da aplicação
 * (entidades e casos de uso) livre de qualquer dependência do Nest.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly osMetrics: OsMetricsService,
  ) {}

  catch(error: DomainError, host: ArgumentsHost): void {
    registrarFalhaTransicaoSeAplicavel(error, this.osMetrics);

    const { httpAdapter } = this.httpAdapterHost;

    if (error instanceof ErroNegocioInternoError) {
      httpAdapter.reply(
        host.switchToHttp().getResponse(),
        {
          codigo: error.codigo,
          mensagem: error.mensagem,
          detalhes: error.detalhes,
        },
        error.statusHttp,
      );
      return;
    }

    const excecao = DomainExceptionFilter.paraExcecaoHttp(error);
    httpAdapter.reply(
      host.switchToHttp().getResponse(),
      excecao.getResponse(),
      excecao.getStatus(),
    );
  }

  private static paraExcecaoHttp(error: DomainError): HttpException {
    if (error instanceof ConteudoIdempotenciaDivergenteError) {
      const interno = new ConteudoDivergenteInternoError();
      return new ConflictException({
        codigo: interno.codigo,
        mensagem: interno.mensagem,
        detalhes: interno.detalhes,
      });
    }
    if (error instanceof EstoqueInsuficienteReservaError) {
      const interno = new EstoqueInsuficienteInternoError(
        error.itensIndisponiveis,
      );
      return new ConflictException({
        codigo: interno.codigo,
        mensagem: interno.mensagem,
        detalhes: interno.detalhes,
      });
    }
    if (error instanceof DomainValidationError) {
      return new BadRequestException(error.message);
    }
    if (error instanceof DomainNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (error instanceof DomainConflictError) {
      return new ConflictException(error.message);
    }
    if (error instanceof DomainUnauthorizedError) {
      return new UnauthorizedException(error.message);
    }
    return new InternalServerErrorException(error.message);
  }
}
