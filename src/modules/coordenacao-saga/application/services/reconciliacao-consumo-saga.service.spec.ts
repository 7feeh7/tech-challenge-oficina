import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import {
  ConsumoAplicadoIncompativelError,
  ReservaJaProcessadaError,
} from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ReconciliacaoConsumoSagaService } from './reconciliacao-consumo-saga.service';
import {
  ResultadoCancelamentoExecucao,
  TipoTarefaCancelamento,
} from '../../domain/resultado-cancelamento-execucao';
import { SituacaoTarefaCancelamento } from '../../domain/situacao-tarefa-cancelamento';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: unknown) => prisma,
}));

const contexto = { __contextoTransacao: Symbol() } as ContextoTransacao;

describe('ReconciliacaoConsumoSagaService', () => {
  const consumir = { execute: jest.fn() };
  const reservas = {
    possuiConsumoAplicadoNaRodada: jest.fn(),
  };

  const prisma = {
    resolucaoConsumoManual: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    consumoAplicadoOs: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pendenciaOs: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    reservaEstoque: { findMany: jest.fn().mockResolvedValue([]) },
    peca: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const service = new ReconciliacaoConsumoSagaService(
    consumir as never,
    reservas as never,
    prisma as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.resolucaoConsumoManual.findUnique.mockResolvedValue(null);
    prisma.consumoAplicadoOs.findUnique.mockResolvedValue(null);
    prisma.pendenciaOs.findFirst.mockResolvedValue(null);
    prisma.pendenciaOs.findMany.mockResolvedValue([]);
    prisma.reservaEstoque.findMany.mockResolvedValue([]);
    prisma.peca.findMany.mockResolvedValue([]);
  });

  it('abre pendência quando resposta sem fatoTerminalEventId', async () => {
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-1',
      {
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
        encerradaEm: '2026-01-01T12:00:00.000Z',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
        motivo: 'falha',
      },
    );
    expect(out).toBe('pendencia_informacao');
    expect(prisma.pendenciaOs.create).toHaveBeenCalled();
  });

  it('aplica consumo com auditoria da resposta', async () => {
    consumir.execute.mockResolvedValue({
      impedimentoInventario: false,
      reutilizado: false,
    });
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-2',
      {
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
        situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
        concluidaEm: '2026-01-01T12:00:00.000Z',
        encerradaEm: '2026-01-01T12:00:00.000Z',
        fatoTerminalEventId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      },
    );
    expect(out).toBe('aplicado');
    expect(consumir.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        contextoFato: expect.objectContaining({
          eventId: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
        }),
      }),
      contexto,
    );
  });

  it('reconhece resolução manual como consumo conciliado', async () => {
    prisma.resolucaoConsumoManual.findUnique.mockResolvedValue({ id: 'r1' });
    await expect(
      service.consumoConciliadoNaRodada(contexto, 'os-1', 1),
    ).resolves.toBe(true);
  });

  it('abre conflito quando eventId diverge do registro existente', async () => {
    prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
      eventId: 'evt-gravado',
      tipoFato: 'REPARO_FALHOU',
      fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
      concluidoEm: null,
      responsavelId: null,
      consumoEfetivo: [],
      divergencias: [],
    });
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'evt-outro',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [],
      [],
      'falha',
      'estoque.consumir:evt-outro',
    );
    expect(out).toBe('pendencia_conflito');
    expect(prisma.pendenciaOs.create).toHaveBeenCalled();
  });

  it('reutiliza registro semanticamente equivalente', async () => {
    const quando = new Date('2026-01-01T12:00:00.000Z');
    prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
      eventId: 'evt-1',
      tipoFato: 'REPARO_CONCLUIDO',
      fatoOcorridoEm: quando,
      concluidoEm: quando,
      responsavelId: null,
      consumoEfetivo: [{ itemId: 'p1', quantidade: 1 }],
      divergencias: [],
    });
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'evt-1',
        fatoOcorridoEm: quando,
        concluidoEm: quando,
        tipoFato: 'REPARO_CONCLUIDO',
        consumoEfetivo: [{ itemId: 'p1', quantidade: 1 }],
      },
      [{ itemId: 'p1', quantidade: 1 }],
      [],
      null,
      'estoque.consumir:evt-1',
    );
    expect(out).toBe('reutilizado');
    expect(consumir.execute).not.toHaveBeenCalled();
  });

  it('traduz ConsumoAplicadoIncompativelError em pendência CONFLITO_CONSUMO', async () => {
    consumir.execute.mockRejectedValue(new ConsumoAplicadoIncompativelError());
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'evt-novo',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [{ itemId: 'p1', quantidade: 1 }],
      [],
      'falha',
      'estoque.consumir:evt-novo',
    );
    expect(out).toBe('pendencia_conflito');
    expect(prisma.pendenciaOs.create).toHaveBeenCalled();
  });

  it('fato tardio compatível grava auditoria sem consumir', async () => {
    const pecaId = 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a001';
    prisma.resolucaoConsumoManual.findUnique.mockResolvedValue({
      id: 'res-1',
      fatoTardioEventId: null,
      itensConsumidos: [{ itemId: pecaId, quantidade: 1 }],
    });
    prisma.resolucaoConsumoManual.findUniqueOrThrow.mockResolvedValue({
      id: 'res-1',
      fatoTardioEventId: null,
      itensConsumidos: [{ itemId: pecaId, quantidade: 1 }],
    });
    prisma.reservaEstoque.findMany.mockResolvedValue([
      { pecaId, quantidade: 2 },
    ]);
    prisma.peca.findMany.mockResolvedValue([{ id: pecaId }]);
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [{ itemId: pecaId, quantidade: 1 }],
      [],
      'falha',
      'estoque.consumir:evt-tardio',
    );
    expect(out).toBe('reutilizado');
    expect(prisma.resolucaoConsumoManual.update).toHaveBeenCalled();
    expect(consumir.execute).not.toHaveBeenCalled();
  });

  it('nada para diagnóstico concluído', async () => {
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-dg',
      {
        tipoTarefa: TipoTarefaCancelamento.DIAGNOSTICO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
        concluidaEm: '2026-01-01T12:00:00.000Z',
        encerradaEm: '2026-01-01T12:00:00.000Z',
      },
    );
    expect(out).toBe('nada');
    expect(consumir.execute).not.toHaveBeenCalled();
  });

  describe('consumoConciliadoNaRodada', () => {
    it('false sem consumo nem resolução', async () => {
      await expect(
        service.consumoConciliadoNaRodada(contexto, 'os-1', 1),
      ).resolves.toBe(false);
    });

    it('true com consumo APLICADO', async () => {
      prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
        situacaoReconciliacao: 'APLICADO',
      });
      await expect(
        service.consumoConciliadoNaRodada(contexto, 'os-1', 1),
      ).resolves.toBe(true);
    });

    it('true com DIVERGENCIA_RESOLVIDA', async () => {
      prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
        situacaoReconciliacao: 'DIVERGENCIA_RESOLVIDA',
      });
      await expect(
        service.consumoConciliadoNaRodada(contexto, 'os-1', 1),
      ).resolves.toBe(true);
    });

    it('DIVERGENCIA_PENDENTE sem bloqueio conta como conciliado', async () => {
      prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
        situacaoReconciliacao: 'DIVERGENCIA_PENDENTE',
      });
      prisma.pendenciaOs.count.mockResolvedValue(0);
      await expect(
        service.consumoConciliadoNaRodada(contexto, 'os-1', 1),
      ).resolves.toBe(true);
    });

    it('DIVERGENCIA_PENDENTE com bloqueio não concilia', async () => {
      prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
        situacaoReconciliacao: 'DIVERGENCIA_PENDENTE',
      });
      prisma.pendenciaOs.count.mockResolvedValue(1);
      await expect(
        service.consumoConciliadoNaRodada(contexto, 'os-1', 1),
      ).resolves.toBe(false);
    });
  });

  it('impedimento de inventário na resposta', async () => {
    consumir.execute.mockResolvedValue({
      impedimentoInventario: true,
      reutilizado: false,
    });
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-imp',
      {
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
        situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
        concluidaEm: '2026-01-01T12:00:00.000Z',
        encerradaEm: '2026-01-01T12:00:00.000Z',
        fatoTerminalEventId: 'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      },
    );
    expect(out).toBe('impedimento_inventario');
  });

  it('reutiliza quando já há resolução manual (exclusão mútua)', async () => {
    prisma.resolucaoConsumoManual.findUnique.mockResolvedValue({
      id: 'res-2',
      fatoTardioEventId: null,
      itensConsumidos: [],
    });
    prisma.resolucaoConsumoManual.findUniqueOrThrow.mockResolvedValue({
      id: 'res-2',
      fatoTardioEventId: null,
      itensConsumidos: [],
    });
    prisma.resolucaoConsumoManual.update.mockResolvedValue({});
    prisma.reservaEstoque.findMany.mockResolvedValue([
      { pecaId: '11111111-1111-4111-8111-111111111111', quantidade: 2 },
    ]);
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-res',
      {
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
        situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
        concluidaEm: '2026-01-01T12:00:00.000Z',
        encerradaEm: '2026-01-01T12:00:00.000Z',
        fatoTerminalEventId: 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      },
    );
    expect(out).toBe('reutilizado');
    expect(consumir.execute).not.toHaveBeenCalled();
  });

  it('ReservaJaProcessadaError com consumo existente reutiliza', async () => {
    consumir.execute.mockRejectedValue(new ReservaJaProcessadaError());
    reservas.possuiConsumoAplicadoNaRodada.mockResolvedValue(true);
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'evt-rjp',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [],
      [],
      null,
      'estoque.consumir:evt-rjp',
    );
    expect(out).toBe('reutilizado');
  });

  it('não duplica pendência de informação insuficiente', async () => {
    prisma.pendenciaOs.findMany.mockResolvedValue([
      {
        id: 'pend-1',
        detalhes: { natureza: 'INFORMACAO_INSUFICIENTE' },
      },
    ]);
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-dup',
      {
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.FALHOU,
        encerradaEm: '2026-01-01T12:00:00.000Z',
        motivo: 'falha',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      },
    );
    expect(out).toBe('pendencia_informacao');
    expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
  });

  it('não duplica pendência CONFLITO_CONSUMO', async () => {
    prisma.pendenciaOs.findMany.mockResolvedValue([
      {
        id: 'pend-c',
        detalhes: { natureza: 'CONFLITO_CONSUMO' },
      },
    ]);
    prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
      eventId: 'evt-a',
      tipoFato: 'REPARO_FALHOU',
      fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
      concluidoEm: null,
      responsavelId: null,
      consumoEfetivo: [{ itemId: 'p1', quantidade: 1 }],
      divergencias: [],
    });
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'evt-b',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [{ itemId: 'p1', quantidade: 2 }],
      [],
      null,
      'estoque.consumir:evt-b',
    );
    expect(out).toBe('pendencia_conflito');
    expect(prisma.pendenciaOs.create).not.toHaveBeenCalled();
  });

  it('não atualiza pendência se conciliação ainda pendente', async () => {
    prisma.pendenciaOs.findMany.mockResolvedValue([
      {
        id: 'pend-inf',
        detalhes: { natureza: 'INFORMACAO_INSUFICIENTE' },
      },
    ]);
    prisma.consumoAplicadoOs.findUnique.mockResolvedValue(null);
    await service.resolverPendenciaInformacaoInsuficienteSeCausaEliminada(
      contexto,
      'os-1',
      1,
    );
    expect(prisma.pendenciaOs.update).not.toHaveBeenCalled();
  });

  it('resolve pendência informação quando causa eliminada', async () => {
    prisma.pendenciaOs.findMany.mockResolvedValue([
      {
        id: 'pend-inf',
        detalhes: { natureza: 'INFORMACAO_INSUFICIENTE' },
      },
    ]);
    prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
      situacaoReconciliacao: 'APLICADO',
    });
    await service.resolverPendenciaInformacaoInsuficienteSeCausaEliminada(
      contexto,
      'os-1',
      1,
    );
    expect(prisma.pendenciaOs.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pend-inf' } }),
    );
  });

  it('fato tardio incompatível abre CONFLITO_CONSUMO', async () => {
    const pecaId = 'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b001';
    prisma.resolucaoConsumoManual.findUnique.mockResolvedValue({
      id: 'res-inc',
      fatoTardioEventId: null,
      itensConsumidos: [{ itemId: pecaId, quantidade: 1 }],
    });
    prisma.resolucaoConsumoManual.findUniqueOrThrow.mockResolvedValue({
      id: 'res-inc',
      fatoTardioEventId: null,
      itensConsumidos: [{ itemId: pecaId, quantidade: 1 }],
    });
    prisma.reservaEstoque.findMany.mockResolvedValue([
      { pecaId, quantidade: 2 },
    ]);
    prisma.peca.findMany.mockResolvedValue([{ id: pecaId }]);
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [{ itemId: pecaId, quantidade: 3 }],
      [],
      null,
      'estoque.consumir:evt-inc',
    );
    expect(out).toBe('pendencia_conflito');
    expect(prisma.pendenciaOs.create).toHaveBeenCalled();
  });

  it('reentrega fato tardio com mesmo eventId reutiliza', async () => {
    prisma.resolucaoConsumoManual.findUnique.mockResolvedValue({
      id: 'res-ft',
      fatoTardioEventId: 'evt-idem',
      itensConsumidos: [],
    });
    prisma.resolucaoConsumoManual.findUniqueOrThrow.mockResolvedValue({
      id: 'res-ft',
      fatoTardioEventId: 'evt-idem',
      itensConsumidos: [],
    });
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'evt-idem',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [],
      [],
      null,
      'estoque.consumir:evt-idem',
    );
    expect(out).toBe('reutilizado');
  });

  it('fato tardio com eventId divergente abre conflito', async () => {
    prisma.resolucaoConsumoManual.findUnique.mockResolvedValue({
      id: 'res-div',
      fatoTardioEventId: 'evt-gravado',
      itensConsumidos: [],
    });
    prisma.resolucaoConsumoManual.findUniqueOrThrow.mockResolvedValue({
      id: 'res-div',
      fatoTardioEventId: 'evt-gravado',
      itensConsumidos: [],
    });
    const out = await service.reconciliarFatoTerminal(
      contexto,
      'os-1',
      1,
      {
        eventId: 'evt-novo',
        fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
        tipoFato: 'REPARO_FALHOU',
      },
      [],
      [],
      null,
      'estoque.consumir:evt-novo',
    );
    expect(out).toBe('pendencia_conflito');
  });

  it('propaga erro quando ReservaJaProcessada sem consumo na rodada', async () => {
    consumir.execute.mockRejectedValue(new ReservaJaProcessadaError());
    reservas.possuiConsumoAplicadoNaRodada.mockResolvedValue(false);
    await expect(
      service.reconciliarFatoTerminal(
        contexto,
        'os-1',
        1,
        {
          eventId: 'evt-throw',
          fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
          tipoFato: 'REPARO_FALHOU',
        },
        [],
        [],
        null,
        'estoque.consumir:evt-throw',
      ),
    ).rejects.toBeInstanceOf(ReservaJaProcessadaError);
  });

  it('marca reutilizado quando consumo idempotente na resposta', async () => {
    consumir.execute.mockResolvedValue({
      impedimentoInventario: false,
      reutilizado: true,
    });
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-reuse',
      {
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_CONCLUIDA,
        situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
        concluidaEm: '2026-01-01T12:00:00.000Z',
        encerradaEm: '2026-01-01T12:00:00.000Z',
        fatoTerminalEventId: 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0',
        pecasUtilizadas: [],
        servicosRealizados: [],
        divergencias: [],
      },
    );
    expect(out).toBe('reutilizado');
  });

  it('conteúdo semanticamente divergente na resposta abre conflito', async () => {
    prisma.consumoAplicadoOs.findUnique.mockResolvedValue({
      eventId: 'evt-s',
      tipoFato: 'REPARO_CONCLUIDO',
      fatoOcorridoEm: new Date('2026-01-01T12:00:00.000Z'),
      concluidoEm: new Date('2026-01-01T12:00:00.000Z'),
      responsavelId: null,
      consumoEfetivo: [{ itemId: 'p1', quantidade: 1 }],
      divergencias: [],
    });
    const out = await service.reconciliarRespostaCancelamento(
      contexto,
      'os-1',
      1,
      'env-sem',
      {
        tipoTarefa: TipoTarefaCancelamento.REPARO,
        resultado: ResultadoCancelamentoExecucao.JA_ENCERRADA,
        situacaoTarefa: SituacaoTarefaCancelamento.CONCLUIDA,
        concluidaEm: '2026-01-01T12:00:00.000Z',
        encerradaEm: '2026-01-01T12:00:00.000Z',
        fatoTerminalEventId: 'evt-s',
        pecasUtilizadas: [{ itemId: 'p1', quantidade: 2 }],
        servicosRealizados: [],
        divergencias: [],
      },
    );
    expect(out).toBe('pendencia_conflito');
  });
});
