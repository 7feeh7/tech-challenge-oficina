import { PrismaService } from '@/shared/database/prisma.service';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';
import {
  ConteudoIdempotenciaDivergenteError,
  EstoqueInsuficienteReservaError,
  PendenciaInventarioJaResolvidaError,
  PendenciaInventarioNaoEncontradaError,
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

  beforeEach(() => jest.clearAllMocks());

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

  it('reservar incrementa reservado e cria linhas', async () => {
    cliente.$queryRaw.mockResolvedValue([
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

  it('liberar devolve vazio quando não há reserva ativa', async () => {
    cliente.reservaEstoque.findMany.mockResolvedValue([]);

    await expect(gateway.liberar(contexto, 'os', 1)).resolves.toEqual([]);
  });

  it('gravarIdempotencia persiste registro 2xx', async () => {
    await gateway.gravarIdempotencia(
      contexto,
      'estoque.liberar',
      'k',
      'hash',
      { ok: true },
    );

    expect(cliente.idempotencyRecord.create).toHaveBeenCalled();
  });

  it('consumir sem divergências libera linhas não informadas', async () => {
    cliente.reservaEstoque.findMany
      .mockResolvedValueOnce([
        {
          id: 'r1',
          pecaId: 'p1',
          quantidade: 2,
          ordemServicoId: 'os',
          rodada: 1,
        },
      ])
      .mockResolvedValueOnce([
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

    cliente.$queryRaw.mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 2,
        ativo: true,
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
    cliente.$queryRaw.mockResolvedValue([]);

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
    cliente.$queryRaw.mockResolvedValue([
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

  it('reservar falha quando peça inativa e flag desligada', async () => {
    cliente.$queryRaw.mockResolvedValue([
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
    cliente.reservaEstoque.findMany
      .mockResolvedValueOnce([
        {
          id: 'r1',
          pecaId: 'p1',
          quantidade: 2,
          ordemServicoId: 'os',
          rodada: 1,
        },
      ])
      .mockResolvedValueOnce([]);
    cliente.$queryRaw.mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 10,
        quantidade_reservada: 2,
        ativo: true,
      },
    ]);
    cliente.$executeRaw.mockResolvedValue(1);
    cliente.pendenciaOs.create.mockResolvedValue({ id: 'pend-1' });

    const out = await gateway.consumir(contexto, {
      ordemServicoId: 'os',
      rodada: 1,
      itensUtilizados: [{ pecaId: 'p1', quantidade: 5 }],
    });

    expect(out.divergencias.length).toBeGreaterThan(0);
    expect(out.pendenciaInventarioId).toBe('pend-1');
  });

  it('liberar atualiza reservas ativas', async () => {
    cliente.reservaEstoque.findMany
      .mockResolvedValueOnce([
        {
          id: 'r1',
          pecaId: 'p1',
          quantidade: 2,
          ordemServicoId: 'os',
          rodada: 1,
        },
      ])
      .mockResolvedValueOnce([
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
    cliente.$queryRaw.mockResolvedValue([
      {
        id: 'p1',
        quantidade_estoque: 8,
        quantidade_reservada: 2,
        ativo: true,
      },
    ]);
    cliente.$executeRaw.mockResolvedValue(1);

    const linhas = await gateway.liberar(contexto, 'os', 1);
    expect(linhas[0]?.situacao).toBe('LIBERADA');
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
    cliente.pendenciaOs.findUnique.mockResolvedValue(null);

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

  it('ajustarFisicoAdministrativo recusa pendência já resolvida', async () => {
    cliente.pendenciaOs.findUnique.mockResolvedValue({ resolvida: true });

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
});