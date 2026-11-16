import type { ConfigService } from '@nestjs/config';
import { criarOpcoesClienteSqs } from './config-cliente-mensageria-aws';

describe('config-cliente-mensageria-aws', () => {
  it('separa timeout de tentativa HTTP do deadline total da operação', () => {
    const config = {
      get: jest.fn((chave: string) => {
        if (chave === 'AWS_REGION') return 'us-east-1';
        if (chave === 'SQS_HTTP_ATTEMPT_TIMEOUT_MS') return '12000';
        if (chave === 'SQS_OPERATION_DEADLINE_MS') return '45000';
        if (chave === 'AWS_SDK_MAX_ATTEMPTS') return '3';
        return undefined;
      }),
    } as unknown as ConfigService;

    const opcoes = criarOpcoesClienteSqs(config);
    expect(opcoes.httpAttemptTimeoutMs).toBe(12000);
    expect(opcoes.operationDeadlineMs).toBe(45000);
    expect(opcoes.maxAttempts).toBe(3);
  });
});
