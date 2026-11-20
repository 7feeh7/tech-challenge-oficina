import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHAMADOR_INTERNO_KEY } from '../decorators/chamador-interno.decorator';
import { ROTA_INTERNA_POST_KEY } from '../decorators/rota-interna-post.decorator';
import { RelacaoChamadorInterno } from '../relacao-chamador-interno';

const HEADER = 'idempotency-key';

@Injectable()
export class IdempotencyKeyInternaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const relacao = this.reflector.getAllAndOverride<RelacaoChamadorInterno>(
      CHAMADOR_INTERNO_KEY,
      [context.getHandler(), context.getClass()],
    );
    const postInterno = this.reflector.getAllAndOverride<boolean>(
      ROTA_INTERNA_POST_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!relacao || !postInterno) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();

    if (request.method?.toUpperCase() !== 'POST') {
      return true;
    }
    const bruto = request.headers[HEADER];
    const valor = Array.isArray(bruto) ? bruto[0] : bruto;

    if (!valor?.trim()) {
      throw new BadRequestException(
        'Idempotency-Key obrigatória nas rotas internas POST.',
      );
    }

    return true;
  }
}
