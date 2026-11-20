import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { ConteudoDivergenteInternoError } from '@/modules/rotas-internas/domain/erros-internos';
import {
  PendenciaNaoElegivelError,
  PendenciaNaoEncontradaError,
} from '../../domain/errors/pendencia.errors';
import {
  ResolverPendenciaManualUseCase,
  SCOPE_RESOLUCAO_MANUAL_PENDENCIA,
} from './resolver-pendencia-manual.use-case';

jest.mock('@/shared/database/obter-instante-banco', () => ({
  obterInstanteBanco: jest
    .fn()
    .mockResolvedValue(new Date('2026-11-19T12:00:00.000Z')),
}));

const input = {
  ordemServicoId: 'os-1',
  pendenciaId: 'pend-1',
  motivo: 'Estorno conferido no painel',
  responsavelId: 'admin-1',
  idempotencyKey: 'chave-1',
};

const evidencia = {
  eventId: 'evt-1',
  orderId: 'ORD-2',
  tipoEstorno: 'INTEGRAL',
};

function montar(
  pendencia: {
    tipo: TipoPendenciaOs;
    detalhes: Record<string, unknown>;
  } | null,
) {
  const ordens = {
    bloquearParaAtualizacao: jest.fn().mockResolvedValue({ ordem: {} }),
  };
  const pendencias = {
    bloquearDaOrdem: jest.fn().mockResolvedValue(
      pendencia && {
        id: 'pend-1',
        ordemServicoId: 'os-1',
        resolvida: false,
        ...pendencia,
      },
    ),
    registrarResolucaoManual: jest.fn(),
  };
  const reservas = {
    listarPecasDivergentesNoCatalogo: jest.fn().mockResolvedValue([]),
  };
  const retomada = { retomarAposResolucaoInventario: jest.fn() };
  const idempotency = {
    hashRequest: jest.fn().mockReturnValue('hash-1'),
    buscarNaTransacao: jest.fn().mockResolvedValue(null),
    gravarNaTransacao: jest.fn(),
  };
  const useCase = new ResolverPendenciaManualUseCase(
    ordens as never,
    pendencias,
    reservas as never,
    retomada,
    new UnitOfWorkFake(),
    idempotency as never,
    {} as never,
  );
  return { useCase, ordens, pendencias, reservas, retomada, idempotency };
}

const segundoPagamento = {
  tipo: TipoPendenciaOs.FINANCEIRA,
  detalhes: {
    natureza: 'SEGUNDO_PAGAMENTO',
    orderId: 'ORD-2',
    evidenciaEstornoBilling: evidencia,
  },
};

const divergenciaForaDoCatalogo = {
  tipo: TipoPendenciaOs.INVENTARIO,
  detalhes: {
    natureza: 'DIVERGENCIA_CONSUMO',
    divergencias: [{ pecaId: 'peca-invalida' }],
  },
};

describe('ResolverPendenciaManualUseCase', () => {
  it('resolve a financeira elegível com auditoria e registra a idempotência, sem retomar a saga', async () => {
    const { useCase, pendencias, retomada, idempotency } =
      montar(segundoPagamento);

    await useCase.execute(input);

    expect(pendencias.registrarResolucaoManual).toHaveBeenCalledWith(
      expect.anything(),
      {
        pendenciaId: 'pend-1',
        responsavelId: 'admin-1',
        resolvidaEm: new Date('2026-11-19T12:00:00.000Z'),
        resolucaoManual: {
          motivo: 'Estorno conferido no painel',
          responsavelId: 'admin-1',
          resolvidaEm: '2026-11-19T12:00:00.000Z',
          caso: 'SEGUNDO_PAGAMENTO_ESTORNADO',
          evidencia: { evidenciaEstornoBilling: evidencia },
        },
      },
    );
    expect(retomada.retomarAposResolucaoInventario).not.toHaveBeenCalled();
    expect(idempotency.gravarNaTransacao).toHaveBeenCalledWith(
      expect.anything(),
      'chave-1',
      SCOPE_RESOLUCAO_MANUAL_PENDENCIA,
      'hash-1',
      204,
      { pendenciaId: 'pend-1', caso: 'SEGUNDO_PAGAMENTO_ESTORNADO' },
    );
  });

  it('resolve o inventário fora do catálogo e retoma a saga', async () => {
    const { useCase, reservas, retomada, pendencias } = montar(
      divergenciaForaDoCatalogo,
    );

    await useCase.execute(input);

    expect(reservas.listarPecasDivergentesNoCatalogo).toHaveBeenCalledWith(
      expect.anything(),
      [{ pecaId: 'peca-invalida' }],
    );
    expect(pendencias.registrarResolucaoManual).toHaveBeenCalledTimes(1);
    expect(retomada.retomarAposResolucaoInventario).toHaveBeenCalledWith(
      expect.anything(),
      'os-1',
      expect.any(String),
    );
  });

  it('não resolve o inventário com peça do catálogo e não grava a chave', async () => {
    const { useCase, reservas, pendencias, retomada, idempotency } = montar(
      divergenciaForaDoCatalogo,
    );
    reservas.listarPecasDivergentesNoCatalogo.mockResolvedValue(['peca-ok']);

    await expect(useCase.execute(input)).rejects.toThrow(
      PendenciaNaoElegivelError,
    );

    expect(pendencias.registrarResolucaoManual).not.toHaveBeenCalled();
    expect(retomada.retomarAposResolucaoInventario).not.toHaveBeenCalled();
    expect(idempotency.gravarNaTransacao).not.toHaveBeenCalled();
  });

  it('só consulta o catálogo para inventário com divergências', async () => {
    const { useCase, reservas } = montar(segundoPagamento);

    await useCase.execute(input);

    expect(reservas.listarPecasDivergentesNoCatalogo).not.toHaveBeenCalled();
  });

  it('responde a repetição sem novo efeito', async () => {
    const { useCase, pendencias, idempotency, retomada } =
      montar(segundoPagamento);
    idempotency.buscarNaTransacao.mockResolvedValue({
      statusCode: 204,
      body: {},
    });

    await useCase.execute(input);

    expect(pendencias.bloquearDaOrdem).not.toHaveBeenCalled();
    expect(pendencias.registrarResolucaoManual).not.toHaveBeenCalled();
    expect(retomada.retomarAposResolucaoInventario).not.toHaveBeenCalled();
    expect(idempotency.gravarNaTransacao).not.toHaveBeenCalled();
  });

  it('propaga CONTEUDO_DIVERGENTE da idempotência', async () => {
    const { useCase, idempotency } = montar(segundoPagamento);
    idempotency.buscarNaTransacao.mockRejectedValue(
      new ConteudoDivergenteInternoError(),
    );

    await expect(useCase.execute(input)).rejects.toThrow(
      ConteudoDivergenteInternoError,
    );
  });

  it('bloqueia a OS antes da pendência', async () => {
    const { useCase, ordens, pendencias } = montar(segundoPagamento);

    await useCase.execute(input);

    expect(
      ordens.bloquearParaAtualizacao.mock.invocationCallOrder[0],
    ).toBeLessThan(pendencias.bloquearDaOrdem.mock.invocationCallOrder[0]);
  });

  it('responde 404 para OS inexistente', async () => {
    const { useCase, ordens } = montar(segundoPagamento);
    ordens.bloquearParaAtualizacao.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(
      OrdemServicoNaoEncontradaError,
    );
  });

  it('responde 404 para pendência inexistente ou de outra OS', async () => {
    const { useCase } = montar(null);

    await expect(useCase.execute(input)).rejects.toThrow(
      PendenciaNaoEncontradaError,
    );
  });

  it('repete a transação uma vez quando outra grava a mesma chave', async () => {
    const { useCase, idempotency, pendencias } = montar(segundoPagamento);
    idempotency.gravarNaTransacao.mockRejectedValueOnce({
      code: 'P2002',
      meta: { modelName: 'IdempotencyRecord' },
    });
    idempotency.buscarNaTransacao
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ statusCode: 204, body: {} });

    await useCase.execute(input);

    expect(idempotency.buscarNaTransacao).toHaveBeenCalledTimes(2);
    expect(pendencias.registrarResolucaoManual).toHaveBeenCalledTimes(1);
  });

  it('não repete a transação para outros erros', async () => {
    const { useCase, idempotency } = montar(segundoPagamento);
    idempotency.gravarNaTransacao.mockRejectedValue(new Error('falha'));

    await expect(useCase.execute(input)).rejects.toThrow('falha');
    expect(idempotency.buscarNaTransacao).toHaveBeenCalledTimes(1);
  });
});
