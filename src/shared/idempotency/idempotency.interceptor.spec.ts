import { ConflictException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { CHAMADOR_INTERNO_KEY } from '@/modules/rotas-internas/decorators/chamador-interno.decorator';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';
import { IDEMPOTENT_SCOPE_KEY } from './idempotent.decorator';

describe('IdempotencyInterceptor', () => {
  const idempotency = {
    hashRequest: jest.fn(),
    findReplay: jest.fn(),
    store: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<IdempotencyService, 'hashRequest' | 'findReplay' | 'store'>
  >;

  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const interceptor = new IdempotencyInterceptor(
    reflector,
    idempotency as unknown as IdempotencyService,
  );

  const next = {
    handle: jest.fn(() => of({ created: true })),
  };

  function criarContexto(
    headers: Record<string, string | string[] | undefined> = {},
    body: unknown = { foo: 'bar' },
  ): ExecutionContext {
    const status = jest.fn();
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers, body }),
        getResponse: () => ({ status, statusCode: 201 }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride = jest.fn((key: string) => {
      if (key === CHAMADOR_INTERNO_KEY) return undefined;
      if (key === IDEMPOTENT_SCOPE_KEY) return 'scope-test';
      return undefined;
    });
    idempotency.hashRequest.mockReturnValue('hash-body');
    idempotency.findReplay.mockResolvedValue(null);
    idempotency.store.mockResolvedValue(undefined);
    next.handle.mockReturnValue(of({ created: true }));
  });

  it('ignora interceptor quando rota não tem escopo idempotente', async () => {
    reflector.getAllAndOverride = jest.fn(() => undefined);

    const result = await firstValueFrom(
      interceptor.intercept(criarContexto(), next),
    );

    expect(result).toEqual({ created: true });
    expect(idempotency.findReplay).not.toHaveBeenCalled();
  });

  it('não intercepta rotas internas com chamador configurado', async () => {
    reflector.getAllAndOverride = jest.fn((key: string) => {
      if (key === CHAMADOR_INTERNO_KEY) return 'BILLING';
      return undefined;
    });

    const result = await firstValueFrom(
      interceptor.intercept(criarContexto({ 'idempotency-key': 'x' }), next),
    );

    expect(result).toEqual({ created: true });
    expect(idempotency.findReplay).not.toHaveBeenCalled();
  });

  it('ignora quando header Idempotency-Key está ausente ou vazio', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(criarContexto({}), next),
    );

    expect(result).toEqual({ created: true });
    expect(idempotency.findReplay).not.toHaveBeenCalled();
  });

  it('repete resposta armazenada quando findReplay encontra registro', async () => {
    idempotency.findReplay.mockResolvedValue({
      statusCode: 200,
      body: { id: 'cached' },
    });

    const resultado = await firstValueFrom(
      interceptor.intercept(
        criarContexto({ 'idempotency-key': 'chave-1' }),
        next,
      ),
    );

    expect(resultado).toEqual({ id: 'cached' });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('executa handler e persiste resposta em fluxo feliz', async () => {
    const resultado = await firstValueFrom(
      interceptor.intercept(
        criarContexto({ 'idempotency-key': 'chave-nova' }),
        next,
      ),
    );

    expect(resultado).toEqual({ created: true });
    expect(idempotency.store).toHaveBeenCalledWith(
      'chave-nova',
      'scope-test',
      'hash-body',
      201,
      { created: true },
    );
  });

  it('recupera replay em corrida quando store falha por chave duplicada', async () => {
    idempotency.store.mockRejectedValue(
      new Error('Unique constraint failed on the fields'),
    );
    idempotency.findReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ statusCode: 201, body: { id: 'replay' } });

    const resultado = await firstValueFrom(
      interceptor.intercept(
        criarContexto({ 'idempotency-key': ['  corrida  '] }),
        next,
      ),
    );

    expect(resultado).toEqual({ id: 'replay' });
    expect(idempotency.findReplay).toHaveBeenLastCalledWith(
      'corrida',
      'scope-test',
      'hash-body',
    );
  });

  it('lança conflito quando corrida não encontra replay', async () => {
    idempotency.store.mockRejectedValue(
      new Error('Unique constraint failed on the fields'),
    );
    idempotency.findReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      firstValueFrom(
        interceptor.intercept(
          criarContexto({ 'idempotency-key': 'chave-corrida' }),
          next,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propaga erro de persistência que não é corrida', async () => {
    idempotency.store.mockRejectedValue(new Error('falha de banco'));

    await expect(
      firstValueFrom(
        interceptor.intercept(
          criarContexto({ 'idempotency-key': 'chave-db' }),
          next,
        ),
      ),
    ).rejects.toThrow('falha de banco');
  });

  it('propaga erro do handler sem tentar gravar', async () => {
    next.handle.mockReturnValue(throwError(() => new Error('falha interna')));

    await expect(
      firstValueFrom(
        interceptor.intercept(
          criarContexto({ 'idempotency-key': 'chave-erro' }),
          next,
        ),
      ),
    ).rejects.toThrow('falha interna');

    expect(idempotency.store).not.toHaveBeenCalled();
  });
});
