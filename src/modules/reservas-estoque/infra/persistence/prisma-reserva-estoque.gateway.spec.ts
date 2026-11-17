import { PrismaService } from '@/shared/database/prisma.service';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import {
  ConteudoIdempotenciaDivergenteError,
  EstoqueFisicoAbaixoReservadoError,
  EstoqueInsuficienteReservaError,
  MotivoAjusteAdministrativoInvalidoError,
  PecaNaoConstaDivergenciaError,
  PendenciaInventarioJaResolvidaError,
  PendenciaInventarioNaoEncontradaError,
  ReservaEstoqueNaoEncontradaError,
  ReservaJaProcessadaError,
} from '../../domain/errors/reserva-estoque.errors';
import { PrismaReservaEstoqueGateway } from './prisma-reserva-estoque.gateway';

jest.mock('@/shared/database/obter-cliente-transacao', () => ({
  obterClienteTransacao: (_ctx: unknown, prisma: PrismaService) => prisma,
}));

describe('PrismaReservaEstoqueGateway', () => {
  const cliente = {
    idempotencyRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    peca: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    reservaEstoque: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    pendenciaOs: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ajusteEstoqueAdministrativo: {
      create: jest.fn(),
    },
  };

  const prisma = cliente as unknown as PrismaService;
  const gateway = new PrismaReservaEstoqueGateway(prisma);
  const contexto = new PrismaContextoTransacao(cliente as never);

  beforeEach(() => {
    jest.clearAllMocks();
    cliente.$queryRaw.mockReset();
    cliente.$executeRaw.mockReset();
  });

  it('buscarIdempotencia devolve null quando não há registro', async () => {
    cliente.idempotencyRecord.findUnique.mockResolvedValue(null);

    await expect(
      gateway.buscarIdempotencia(contexto, 'estoque.reservar', 'k', 'h'),
    ).resolves.toBeNull();
  });

  it('buscarIdempotencia devolve replay quando a chave existe', async () => {
    cliente.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'hash',
      responseBody: { ok: true },
    });

    const out = await gateway.buscarIdempotencia<{ ok: boolean }>(
      contexto,
      'estoque.reservar',
      'key',
      'hash',
    );

    expect(out?.reutilizado).toBe(true);
    expect(out?.resultado.ok).toBe(true);
  });

  it('buscarIdempotencia recusa hash divergente', async () => {
    cliente.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'outro',
      responseBody: {},
    });

    await expect(
      gateway.buscarIdempotencia(contexto, 'estoque.reservar', 'key', 'hash'),
    ).rejects.toThrow(ConteudoIdempotenciaDivergenteError);
  });

  it('reservar falha no UPDATE condicional após checagem prévia', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 0,
        ativo: true,
      },
    ]);
    cliente.$executeRaw.mockResolvedValue(0);

    await expect(
      gateway.reservar(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        grupoReservaId: 'g1',
        prazoReferencia: null,
        itens: [{ pecaId: 'p1', quantidade: 3 }],
        permitirPecaInativa: false,
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);
  });

  it('reservar incrementa reservado e cria linhas', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 0,
        ativo: true,
      },
    ]);
    cliente.$executeRaw.mockResolvedValue(1);
    cliente.reservaEstoque.create.mockResolvedValue({
      id: 'r1',
      grupoReservaId: 'g1',
      ordemServicoId: 'os',
      rodada: 1,
      pecaId: 'p1',
      quantidade: 3,
      quantidadeConsumida: 0,
      situacao: 'ATIVA',
      prazoReferencia: null,
    });

    const out = await gateway.reservar(contexto, {
      ordemServicoId: 'os',
      rodada: 1,
      grupoReservaId: 'g1',
      prazoReferencia: null,
      itens: [{ pecaId: 'p1', quantidade: 3 }],
      permitirPecaInativa: false,
    });

    expect(out.linhas).toHaveLength(1);
    expect(cliente.$executeRaw).toHaveBeenCalled();
  });

  it('liberar devolve vazio quando não há reserva ativa mas já houve processamento', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]);
    cliente.reservaEstoque.findFirst.mockResolvedValue({ id: 'r-antiga' });

    await expect(gateway.liberar(contexto, 'os', 1)).resolves.toEqual([]);
  });

  it('liberar recusa quando não há reserva alguma na rodada', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]);
    cliente.reservaEstoque.findFirst.mockResolvedValue(null);

    await expect(gateway.liberar(contexto, 'os', 1)).rejects.toThrow(
      ReservaEstoqueNaoEncontradaError,
    );
  });

  it('gravarIdempotencia persiste registro 2xx', async () => {
    await gateway.gravarIdempotencia(contexto, 'estoque.liberar', 'k', 'hash', {
      ok: true,
    });

    expect(cliente.idempotencyRecord.create).toHaveBeenCalled();
  });

  it('consumir sem divergências libera linhas não informadas', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'r1',
          peca_id: 'p1',
          quantidade: 2,
          ordem_servico_id: 'os',
          rodada: 1,
          grupo_reserva_id: 'g1',
          quantidade_consumida: 0,
          situacao: 'ATIVA',
          prazo_referencia: null,
        },
      ])
      .mockResolvedValue([
        {
          id: 'p1',
          quantidade_estoque: 10,
          quantidade_reservada: 2,
          ativo: true,
        },
      ]);
    cliente.reservaEstoque.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        grupoReservaId: 'g1',
        ordemServicoId: 'os',
        rodada: 1,
        pecaId: 'p1',
        quantidade: 2,
        quantidadeConsumida: 1,
        situacao: 'CONSUMIDA',
        prazoReferencia: null,
      },
    ]);
    cliente.$executeRaw.mockResolvedValue(1);

    const out = await gateway.consumir(contexto, {
      ordemServicoId: 'os',
      rodada: 1,
      itensUtilizados: [{ pecaId: 'p1', quantidade: 1 }],
    });

    expect(out.divergencias).toHaveLength(0);
    expect(out.pendenciaInventarioId).toBeNull();
  });

  it('reservar falha quando a peça não existe', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      gateway.reservar(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        grupoReservaId: 'g1',
        prazoReferencia: null,
        itens: [{ pecaId: 'p1', quantidade: 1 }],
        permitirPecaInativa: false,
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);
  });

  it('reserva vazia é rejeitada', async () => {
    await expect(
      gateway.reservar(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        grupoReservaId: 'g1',
        prazoReferencia: null,
        itens: [],
        permitirPecaInativa: false,
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);
  });

  it('reservar falha quando disponível é menor que solicitado', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 3,
        quantidade_reservada: 0,
        ativo: true,
      },
    ]);

    await expect(
      gateway.reservar(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        grupoReservaId: 'g1',
        prazoReferencia: null,
        itens: [{ pecaId: 'p1', quantidade: 5 }],
        permitirPecaInativa: false,
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);
  });

  it('reservar aceita peça inativa quando flag ligada', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 0,
        ativo: false,
      },
    ]);
    cliente.$executeRaw.mockResolvedValue(1);
    cliente.reservaEstoque.create.mockResolvedValue({
      id: 'r1',
      grupoReservaId: 'g1',
      ordemServicoId: 'os',
      rodada: 1,
      pecaId: 'p1',
      quantidade: 1,
      quantidadeConsumida: 0,
      situacao: 'ATIVA',
      prazoReferencia: null,
    });

    const out = await gateway.reservar(contexto, {
      ordemServicoId: 'os',
      rodada: 1,
      grupoReservaId: 'g1',
      prazoReferencia: null,
      itens: [{ pecaId: 'p1', quantidade: 1 }],
      permitirPecaInativa: true,
    });

    expect(out.linhas).toHaveLength(1);
  });

  it('reservar falha quando peça inativa e flag desligada', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 0,
        ativo: false,
      },
    ]);

    await expect(
      gateway.reservar(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        grupoReservaId: 'g1',
        prazoReferencia: null,
        itens: [{ pecaId: 'p1', quantidade: 1 }],
        permitirPecaInativa: false,
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);
  });

  it('consumir com divergência cria pendência de inventário', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'r1',
          peca_id: 'p1',
          quantidade: 2,
          ordem_servico_id: 'os',
          rodada: 1,
          grupo_reserva_id: 'g1',
          quantidade_consumida: 0,
          situacao: 'ATIVA',
          prazo_referencia: null,
        },
      ])
      .mockResolvedValue([
        {
          id: 'p1',
          quantidade_estoque: 10,
          quantidade_reservada: 2,
          ativo: true,
        },
      ]);
    cliente.$executeRaw.mockResolvedValue(1);
    cliente.pendenciaOs.create.mockResolvedValue({ id: 'pend-1' });
    cliente.reservaEstoque.findMany.mockResolvedValueOnce([]);

    const out = await gateway.consumir(contexto, {
      ordemServicoId: 'os',
      rodada: 1,
      itensUtilizados: [{ pecaId: 'p1', quantidade: 5 }],
    });

    expect(out.divergencias.length).toBeGreaterThan(0);
    expect(out.pendenciaInventarioId).toBe('pend-1');
  });

  it('liberar falha quando UPDATE de peça não afeta linha', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'r1',
          peca_id: 'p1',
          quantidade: 2,
          ordem_servico_id: 'os',
          rodada: 1,
          grupo_reserva_id: 'g1',
          quantidade_consumida: 0,
          situacao: 'ATIVA',
          prazo_referencia: null,
        },
      ])
      .mockResolvedValue([
        {
          id: 'p1',
          quantidade_estoque: 8,
          quantidade_reservada: 0,
          ativo: true,
        },
      ]);
    cliente.$executeRaw.mockResolvedValue(0);

    await expect(gateway.liberar(contexto, 'os', 1)).rejects.toThrow(
      ReservaJaProcessadaError,
    );
  });

  it('liberar atualiza reservas ativas', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'r1',
          peca_id: 'p1',
          quantidade: 2,
          ordem_servico_id: 'os',
          rodada: 1,
          grupo_reserva_id: 'g1',
          quantidade_consumida: 0,
          situacao: 'ATIVA',
          prazo_referencia: null,
        },
      ])
      .mockResolvedValue([
        {
          id: 'p1',
          quantidade_estoque: 8,
          quantidade_reservada: 2,
          ativo: true,
        },
      ]);
    cliente.reservaEstoque.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        grupoReservaId: 'g1',
        ordemServicoId: 'os',
        rodada: 1,
        pecaId: 'p1',
        quantidade: 2,
        quantidadeConsumida: 0,
        situacao: 'LIBERADA',
        prazoReferencia: null,
      },
    ]);
    cliente.$executeRaw.mockResolvedValue(1);

    const linhas = await gateway.liberar(contexto, 'os', 1);
    expect(linhas[0]?.situacao).toBe('LIBERADA');
  });

  it('consumir falha quando UPDATE de peça não aplica', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'r1',
          peca_id: 'p1',
          quantidade: 2,
          ordem_servico_id: 'os',
          rodada: 1,
          grupo_reserva_id: 'g1',
          quantidade_consumida: 0,
          situacao: 'ATIVA',
          prazo_referencia: null,
        },
      ])
      .mockResolvedValue([
        {
          id: 'p1',
          quantidade_estoque: 10,
          quantidade_reservada: 2,
          ativo: true,
        },
      ]);
    cliente.$executeRaw.mockResolvedValue(0);

    await expect(
      gateway.consumir(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        itensUtilizados: [{ pecaId: 'p1', quantidade: 1 }],
      }),
    ).rejects.toThrow(ReservaJaProcessadaError);
  });

  it('consumir sem reserva alguma na rodada retorna 404', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]);
    cliente.reservaEstoque.findFirst.mockResolvedValue(null);

    await expect(
      gateway.consumir(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        itensUtilizados: [{ pecaId: 'p1', quantidade: 1 }],
      }),
    ).rejects.toThrow(ReservaEstoqueNaoEncontradaError);
  });

  it('consumir sem reserva ativa mas já processada recusa com 409', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]);
    cliente.reservaEstoque.findFirst.mockResolvedValue({ id: 'r1' });

    await expect(
      gateway.consumir(contexto, {
        ordemServicoId: 'os',
        rodada: 1,
        itensUtilizados: [{ pecaId: 'p1', quantidade: 1 }],
      }),
    ).rejects.toThrow(ReservaJaProcessadaError);
  });

  it('listarLinhasAtivas consulta só reservas ATIVA', async () => {
    cliente.reservaEstoque.findMany.mockResolvedValue([]);

    await gateway.listarLinhasAtivas(contexto, 'os', 1);

    expect(cliente.reservaEstoque.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ situacao: 'ATIVA' }),
      }),
    );
  });

  it('ajustarFisicoAdministrativo recusa pendência ausente', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      gateway.ajustarFisicoAdministrativo(contexto, {
        pendenciaId: 'x',
        pecaId: 'p1',
        quantidadeFisicaNova: 5,
        motivo: 'teste',
        responsavelId: 'admin',
      }),
    ).rejects.toThrow(PendenciaInventarioNaoEncontradaError);
  });

  it('ajustarFisicoAdministrativo recusa motivo vazio', async () => {
    await expect(
      gateway.ajustarFisicoAdministrativo(contexto, {
        pendenciaId: 'pend',
        pecaId: 'p1',
        quantidadeFisicaNova: 5,
        motivo: '   ',
        responsavelId: 'admin',
      }),
    ).rejects.toThrow(MotivoAjusteAdministrativoInvalidoError);
  });

  it('ajustarFisicoAdministrativo recusa peça fora da divergência', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([
      {
        id: 'pend',
        ordem_servico_id: 'os',
        rodada: 1,
        resolvida: false,
        detalhes: { divergencias: [{ pecaId: 'outra' }] },
      },
    ]);
    cliente.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      gateway.ajustarFisicoAdministrativo(contexto, {
        pendenciaId: 'pend',
        pecaId: 'p1',
        quantidadeFisicaNova: 5,
        motivo: 'ok',
        responsavelId: 'admin',
      }),
    ).rejects.toThrow(PecaNaoConstaDivergenciaError);
  });

  it('ajustarFisicoAdministrativo falha quando UPDATE condicional do físico não aplica', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'pend',
          ordem_servico_id: 'os',
          rodada: 1,
          resolvida: false,
          detalhes: { divergencias: [{ pecaId: 'p1' }] },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'p1',
          quantidade_estoque: 10,
          quantidade_reservada: 2,
          ativo: true,
        },
      ]);
    cliente.$executeRaw.mockResolvedValue(0);

    await expect(
      gateway.ajustarFisicoAdministrativo(contexto, {
        pendenciaId: 'pend',
        pecaId: 'p1',
        quantidadeFisicaNova: 10,
        motivo: 'ok',
        responsavelId: 'admin',
      }),
    ).rejects.toThrow(EstoqueFisicoAbaixoReservadoError);
  });

  it('ajustarFisicoAdministrativo recusa físico abaixo do reservado', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'pend',
          ordem_servico_id: 'os',
          rodada: 1,
          resolvida: false,
          detalhes: { divergencias: [{ pecaId: 'p1' }] },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'p1',
          quantidade_estoque: 10,
          quantidade_reservada: 7,
          ativo: true,
        },
      ]);

    await expect(
      gateway.ajustarFisicoAdministrativo(contexto, {
        pendenciaId: 'pend',
        pecaId: 'p1',
        quantidadeFisicaNova: 5,
        motivo: 'ok',
        responsavelId: 'admin',
      }),
    ).rejects.toThrow(EstoqueFisicoAbaixoReservadoError);
  });

  it('ajustarFisicoAdministrativo resolve pendência e audita ajuste', async () => {
    cliente.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'pend',
          ordem_servico_id: 'os',
          rodada: 1,
          resolvida: false,
          detalhes: { divergencias: [{ pecaId: 'p1' }] },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'p1',
          quantidade_estoque: 8,
          quantidade_reservada: 2,
          ativo: true,
        },
      ]);
    cliente.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    cliente.ajusteEstoqueAdministrativo.create.mockResolvedValue({ id: 'aj' });

    await gateway.ajustarFisicoAdministrativo(contexto, {
      pendenciaId: 'pend',
      pecaId: 'p1',
      quantidadeFisicaNova: 9,
      motivo: 'Conferência',
      responsavelId: 'admin',
    });

    expect(cliente.ajusteEstoqueAdministrativo.create).toHaveBeenCalled();
  });

  it('ajustarFisicoAdministrativo recusa pendência já resolvida', async () => {
    cliente.$queryRaw.mockResolvedValueOnce([
      {
        id: 'pend',
        ordem_servico_id: 'os',
        rodada: 1,
        resolvida: true,
        detalhes: { divergencias: [{ pecaId: 'p1' }] },
      },
    ]);

    await expect(
      gateway.ajustarFisicoAdministrativo(contexto, {
        pendenciaId: 'x',
        pecaId: 'p1',
        quantidadeFisicaNova: 5,
        motivo: 'teste',
        responsavelId: 'admin',
      }),
    ).rejects.toThrow(PendenciaInventarioJaResolvidaError);
  });

  it('possuiConsumoAplicado exige todas as peças CONSUMIDA', async () => {
    cliente.reservaEstoque.count = jest.fn().mockResolvedValue(2);
    await expect(
      gateway.possuiConsumoAplicado(contexto, 'os', 1, ['p1', 'p2']),
    ).resolves.toBe(true);
    cliente.reservaEstoque.count = jest.fn().mockResolvedValue(1);
    await expect(
      gateway.possuiConsumoAplicado(contexto, 'os', 1, ['p1', 'p2']),
    ).resolves.toBe(false);
  });
});
