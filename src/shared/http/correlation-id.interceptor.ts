import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  correlationIdStorage,
  extractCorrelationId,
} from './correlation-id.context';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const correlationId = extractCorrelationId(request.headers);

    return correlationIdStorage.run({ correlationId }, () => next.handle());
  }
}
