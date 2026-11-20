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
  extractRequestId,
} from './correlation-id.context';
import { tagActiveSpanWithCorrelation } from '@/shared/observability/trace-context';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const correlationId = extractCorrelationId(request.headers);
    const requestId = extractRequestId(request.headers);
    request.headers['x-request-id'] = requestId;

    return correlationIdStorage.run({ correlationId, requestId }, () => {
      tagActiveSpanWithCorrelation(correlationId);
      return next.handle();
    });
  }
}
