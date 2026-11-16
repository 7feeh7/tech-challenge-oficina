import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { ConfigService } from '@nestjs/config';

export interface OpcoesClienteMensageriaAws {
  region: string;
  maxAttempts: number;
  requestHandler: NodeHttpHandler;
  connectionTimeoutMs: number;
  /** Timeout de uma tentativa HTTP (NodeHttpHandler). */
  httpAttemptTimeoutMs: number;
  /** Prazo total da operação (deadline AbortSignal; inclui retentativas do SDK). */
  operationDeadlineMs: number;
}

export function criarOpcoesClienteSqs(
  config: ConfigService,
): OpcoesClienteMensageriaAws {
  return criarOpcoesCliente(
    config,
    'SQS_CONNECTION_TIMEOUT_MS',
    'SQS_HTTP_ATTEMPT_TIMEOUT_MS',
    'SQS_REQUEST_TIMEOUT_MS',
    'SQS_OPERATION_DEADLINE_MS',
  );
}

export function criarOpcoesClienteSns(
  config: ConfigService,
): OpcoesClienteMensageriaAws {
  return criarOpcoesCliente(
    config,
    'SNS_CONNECTION_TIMEOUT_MS',
    'SNS_HTTP_ATTEMPT_TIMEOUT_MS',
    'SNS_REQUEST_TIMEOUT_MS',
    'SNS_OPERATION_DEADLINE_MS',
  );
}

function criarOpcoesCliente(
  config: ConfigService,
  chaveConnection: string,
  chaveAttempt: string,
  chaveAttemptLegado: string,
  chaveDeadline: string,
): OpcoesClienteMensageriaAws {
  const region = config.get<string>('AWS_REGION') ?? 'us-east-1';
  const connectionTimeoutMs = Number(
    config.get<string>(chaveConnection) ?? '5000',
  );
  const httpAttemptTimeoutMs = Number(
    config.get<string>(chaveAttempt) ??
      config.get<string>(chaveAttemptLegado) ??
      '12000',
  );
  const maxAttempts = Number(config.get<string>('AWS_SDK_MAX_ATTEMPTS') ?? '3');
  const brutoDeadline = config.get<string>(chaveDeadline);
  const operationDeadlineMs = Number(
    brutoDeadline ?? String(httpAttemptTimeoutMs * maxAttempts),
  );
  const deadlineSeguro = Number.isFinite(operationDeadlineMs)
    ? operationDeadlineMs
    : httpAttemptTimeoutMs * maxAttempts;
  const requestHandler = new NodeHttpHandler({
    connectionTimeout: connectionTimeoutMs,
    requestTimeout: httpAttemptTimeoutMs,
  });
  return {
    region,
    maxAttempts,
    requestHandler,
    connectionTimeoutMs,
    httpAttemptTimeoutMs,
    operationDeadlineMs: deadlineSeguro,
  };
}
