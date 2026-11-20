import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import { getCorrelationId } from '@/shared/http/correlation-id.context';
import { ProcessadorPrazoReferenciaService } from './processador-prazo-referencia.service';

describe('ProcessadorPrazoReferenciaService', () => {
  const criarConfig = (valores: Record<string, string>) => ({
    get: jest.fn((chave: string) => valores[chave]),
  });

  const criarServico = (
    valores: Record<string, string>,
    dependencias: {
      reivindicarElegiveis?: jest.Mock;
      emitirConsultaVigente?: jest.Mock;
      findUnique?: jest.Mock;
    } = {},
  ) => {
    const reivindicarElegiveis =
      dependencias.reivindicarElegiveis ?? jest.fn().mockResolvedValue([]);
    const emitirConsultaVigente =
      dependencias.emitirConsultaVigente ??
      jest.fn().mockResolvedValue('emitida');
    const findUnique =
      dependencias.findUnique ??
      jest
        .fn()
        .mockResolvedValue({ correlationId: 'corr-1', rodadaVigente: 2 });
    const contexto = new PrismaContextoTransacao({
      ordemServico: { findUnique },
    } as never);
    const executar = jest.fn((trabalho: (c: unknown) => Promise<unknown>) =>
      trabalho(contexto),
    );
    const service = new ProcessadorPrazoReferenciaService(
      criarConfig(valores) as never,
      { reivindicarElegiveis } as never,
      { emitirConsultaVigente } as never,
      { executar } as never,
      {} as never,
    );
    return {
      service,
      reivindicarElegiveis,
      emitirConsultaVigente,
      findUnique,
      executar,
      contexto,
    };
  };

  it('não agenda intervalo quando desabilitado', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'PRAZO_REFERENCIA_VERIFICADOR_HABILITADO' ? 'false' : '10',
      ),
    };
    const service = new ProcessadorPrazoReferenciaService(
      config as never,
      { reivindicarElegiveis: jest.fn() } as never,
      { emitirConsultaVigente: jest.fn() } as never,
      { executar: jest.fn() } as never,
      {} as never,
    );
    const agendar = jest.spyOn(global, 'setInterval');
    service.onModuleInit();
    expect(agendar).not.toHaveBeenCalled();
    expect(
      (service as unknown as { agendador?: unknown }).agendador,
    ).toBeUndefined();
    agendar.mockRestore();
  });

  it('usa o AgendadorCicloProcessador, sem setInterval, quando habilitado', async () => {
    const { service } = criarServico({
      PRAZO_REFERENCIA_VERIFICADOR_HABILITADO: 'true',
      PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS: '999999',
    });
    const agendar = jest.spyOn(global, 'setInterval');

    service.onModuleInit();

    expect(agendar).not.toHaveBeenCalled();
    expect(
      (service as unknown as { agendador?: unknown }).agendador,
    ).toBeDefined();
    await service.onModuleDestroy();
    agendar.mockRestore();
  });

  it('o desligamento aguarda o ciclo em andamento e não inicia outro', async () => {
    let concluirReivindicacao!: (ids: string[]) => void;
    const reivindicarElegiveis = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          concluirReivindicacao = resolve;
        }),
    );
    const { service, executar } = criarServico(
      {
        PRAZO_REFERENCIA_VERIFICADOR_HABILITADO: 'true',
        PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS: '1',
      },
      { reivindicarElegiveis },
    );
    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reivindicarElegiveis).toHaveBeenCalledTimes(1);

    let encerrado = false;
    const desligamento = service.onModuleDestroy().then(() => {
      encerrado = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(encerrado).toBe(false);

    concluirReivindicacao(['os-1']);
    await desligamento;

    expect(encerrado).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reivindicarElegiveis).toHaveBeenCalledTimes(1);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('não sobrepõe ciclos: o seguinte só começa depois do término do anterior', async () => {
    let emAndamento = 0;
    let maximoSimultaneo = 0;
    const reivindicarElegiveis = jest.fn(async () => {
      emAndamento += 1;
      maximoSimultaneo = Math.max(maximoSimultaneo, emAndamento);
      await new Promise((resolve) => setTimeout(resolve, 30));
      emAndamento -= 1;
      return [];
    });
    const { service } = criarServico(
      {
        PRAZO_REFERENCIA_VERIFICADOR_HABILITADO: 'true',
        PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS: '1',
      },
      { reivindicarElegiveis },
    );

    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await service.onModuleDestroy();

    expect(reivindicarElegiveis.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(maximoSimultaneo).toBe(1);
  });

  it('usa lote 5 e posse de 150000 ms por padrão', async () => {
    const { service, reivindicarElegiveis } = criarServico({});

    await service.processarLote();

    expect(reivindicarElegiveis).toHaveBeenCalledWith(5, 150_000);
  });

  it('respeita lote e posse configurados', async () => {
    const { service, reivindicarElegiveis } = criarServico({
      PRAZO_REFERENCIA_VERIFICADOR_LOTE: '3',
      PRAZO_REFERENCIA_REIVINDICACAO_MS: '90000',
    });

    await service.processarLote();

    expect(reivindicarElegiveis).toHaveBeenCalledWith(3, 90_000);
  });

  it('emite a consulta de cada OS numa única transação, com o correlationId da OS', async () => {
    let correlationIdNaEmissao: string | undefined;
    const emitirConsultaVigente = jest.fn(() => {
      correlationIdNaEmissao = getCorrelationId();
      return Promise.resolve('emitida');
    });
    const { service, executar, findUnique, contexto } = criarServico(
      {},
      {
        reivindicarElegiveis: jest.fn().mockResolvedValue(['os-1', 'os-2']),
        emitirConsultaVigente,
      },
    );

    await service.processarLote();

    expect(executar).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(emitirConsultaVigente).toHaveBeenNthCalledWith(
      1,
      contexto,
      'os-1',
      expect.any(String),
      false,
    );
    expect(correlationIdNaEmissao).toBe('corr-1');
  });

  it('ignora a OS que deixou de existir entre a reivindicação e a emissão', async () => {
    const { service, emitirConsultaVigente } = criarServico(
      {},
      {
        reivindicarElegiveis: jest.fn().mockResolvedValue(['os-1']),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    );

    await service.processarLote();

    expect(emitirConsultaVigente).not.toHaveBeenCalled();
  });
});
