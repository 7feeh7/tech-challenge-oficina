import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of, switchMap } from 'rxjs';
import { IDEMPOTENT_SCOPE_KEY } from './idempotent.decorator';
import { IdempotencyService } from './idempotency.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';

type HttpResponseLike = {
  status: (code: number) => void;
  statusCode?: number;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = this.reflector.getAllAndOverride<string>(
      IDEMPOTENT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!scope) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      body?: unknown;
    }>();

    const rawKey = request.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key?.trim()) {
      return next.handle();
    }

    const requestHash = this.idempotency.hashRequest(request.body);
    const idempotencyKey = key.trim();

    return from(
      this.idempotency.findReplay(idempotencyKey, scope, requestHash),
    ).pipe(
      switchMap((replay) => {
        if (replay) {
          const response = this.getResponse(context);
          response.status(replay.statusCode);
          return of(replay.body);
        }

        return from(
          this.executeAndStore(
            context,
            next,
            idempotencyKey,
            scope,
            requestHash,
          ),
        );
      }),
    );
  }

  private getResponse(context: ExecutionContext): HttpResponseLike {
    return context.switchToHttp().getResponse<HttpResponseLike>();
  }

  private async executeAndStore(
    context: ExecutionContext,
    next: CallHandler,
    key: string,
    scope: string,
    requestHash: string,
  ): Promise<unknown> {
    const body = await new Promise<unknown>((resolve, reject) => {
      next.handle().subscribe({ next: resolve, error: reject });
    });

    const response = this.getResponse(context);
    const statusCode = response.statusCode ?? 200;

    try {
      await this.idempotency.store(key, scope, requestHash, statusCode, body);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        const cached = await this.idempotency.findReplay(
          key,
          scope,
          requestHash,
        );
        if (cached) {
          response.status(cached.statusCode);
          return cached.body;
        }
        throw new ConflictException('Concurrent idempotent request detected.');
      }
      throw error;
    }

    return body;
  }
}
