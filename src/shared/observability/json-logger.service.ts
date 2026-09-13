import { Injectable, LoggerService } from '@nestjs/common';
import { getCorrelationId } from '@/shared/http/correlation-id.context';
import { OBSERVABILITY } from './observability.config';
import { sanitizeObject } from './log-sanitizer';
import { getActiveTraceIds } from './trace-context';

interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  environment: string;
  version: string;
  message: string;
  context?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

@Injectable()
export class JsonLoggerService implements LoggerService {
  private formatLog(
    level: string,
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): string {
    const { traceId, spanId } = getActiveTraceIds();
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: OBSERVABILITY.service,
      environment: OBSERVABILITY.env,
      version: OBSERVABILITY.version,
      message: sanitizeString(message),
      correlationId: getCorrelationId(),
    };

    if (context) entry.context = context;
    if (traceId) entry.traceId = traceId;
    if (spanId) entry.spanId = spanId;
    if (meta) Object.assign(entry, sanitizeObject(meta));

    return JSON.stringify(entry);
  }

  log(message: string, context?: string): void {
    console.log(this.formatLog('info', message, context));
  }

  error(message: string, trace?: string, context?: string): void {
    console.error(
      this.formatLog(
        'error',
        message,
        context,
        trace ? { stack: trace } : undefined,
      ),
    );
  }

  warn(message: string, context?: string): void {
    console.warn(this.formatLog('warn', message, context));
  }

  debug(message: string, context?: string): void {
    console.debug(this.formatLog('debug', message, context));
  }

  verbose(message: string, context?: string): void {
    console.log(this.formatLog('verbose', message, context));
  }

  logWithMeta(
    level: 'info' | 'error' | 'warn' | 'debug',
    message: string,
    meta: Record<string, unknown>,
    context?: string,
  ): void {
    const output = this.formatLog(level, message, context, meta);
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }
}

function sanitizeString(message: string): string {
  return typeof message === 'string' ? sanitizeStringValue(message) : message;
}

function sanitizeStringValue(message: string): string {
  const sanitized = sanitizeObject({ message });
  const value = sanitized.message;
  return typeof value === 'string' ? value : message;
}
