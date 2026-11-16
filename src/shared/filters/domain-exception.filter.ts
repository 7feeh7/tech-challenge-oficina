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
import {
  DomainConflictError,
  DomainError,
  DomainNotFoundError,
  DomainUnauthorizedError,
  DomainValidationError,
} from '../exceptions/domain.error';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import { registrarFalhaTransicaoSeAplicavel } from '@/shared/observability/registrar-falha-transicao';

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

    const excecao = DomainExceptionFilter.paraExcecaoHttp(error);
    const { httpAdapter } = this.httpAdapterHost;

    httpAdapter.reply(
      host.switchToHttp().getResponse(),
      excecao.getResponse(),
      excecao.getStatus(),
    );
  }

  private static paraExcecaoHttp(error: DomainError): HttpException {
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
