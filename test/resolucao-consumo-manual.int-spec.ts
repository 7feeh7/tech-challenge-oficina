import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/shared/generated/prisma/client';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { ResolverConsumoManualUseCase } from '@/modules/reservas-estoque/application/use-cases/resolver-consumo-manual.use-case';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import { ConsumirReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import { PrismaUnitOfWork } from '@/shared/database/prisma-unit-of-work';
import { UNIT_OF_WORK } from '@/shared/database/unit-of-work.port';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ResolucaoConsumoManualComConsumoAplicadoError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import {
  EVENTO_REPARO_FALHOU,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
} from '@/shared/messaging/envelope';
import {
  montarEnvelopeE42,
  payloadReparoEncerradoE42,
  QUANDO_ENCERRAMENTO_E42,
} from './helpers/e42-envelope';
import { SituacaoReservaEstoque } from '@/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';
import { contextoFatoIntegracao } from './helpers/contexto-fato-estoque';

function criarPrismaPool(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 15_000,
  });
  return new PrismaClient({ adapter });
}

describe('Resolução manual de consumo (integração E42)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let reservar: ReservarEstoqueUseCase;
  let consumir: ConsumirReservaEstoqueUseCase;
  let resolver: ResolverConsumoManualUseCase;
  let processar: ProcessarMensagemEntradaService;
  let unitOfWork: PrismaUnitOfWork;

  async function criarOs() {
    const cliente = await prisma.cliente.create({
      data: {
        nome: 'Cliente resolução',
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '8'),
        email: `res-${randomUUID()}@t.local`,
        telefone: '11966665555',
      },
    });
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId: cliente.id,
        marca: 'M',
        modelo: 'M',
        ano: 2020,
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
      },
    });
    return prisma.ordemServico.create({
      data: {
        correlationId: randomUUID(),
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        status: 'EM_CANCELAMENTO',
      },
    });
  }

  async function abrirPendenciaInformacaoInsuficiente(
    ordemServicoId: string,
    rodada: number,
  ) {
    return prisma.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId,
        rodada,
        tipo: 'INVENTARIO',
        detalhes: {
          natureza: 'INFORMACAO_INSUFICIENTE',
          conteudo: {},
        },
      },
    });
  }

  beforeAll(async () => {
    exigirDatabaseUrl();
    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ObservabilityModule,
        IdempotencyModule,
        PrismaModule,
        MensageriaModule,
        CoordenacaoSagaModule,
        ReservasEstoqueModule,
      ],
    }).compile();
    prisma = nestModule.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    reservar = nestModule.get(ReservarEstoqueUseCase);
    consumir = nestModule.get(ConsumirReservaEstoqueUseCase);
    resolver = nestModule.get(ResolverConsumoManualUseCase);
    processar = nestModule.get(ProcessarMensagemEntradaService);
    unitOfWork = nestModule.get(UNIT_OF_WORK);
  });

  afterAll(async () => fecharModuloIntegracao(nestModule));

  it('registra resolução, movimenta reservas e resolve pendência', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `RM-${randomUUID().slice(0, 6)}`,
        nome: 'P',
        precoUnitario: 10,
        quantidadeEstoque: 20,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const estoqueAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const adminId = randomUUID();
    const resultado = await resolver.execute({
      pendenciaId: pendencia.id,
      itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
      itensLiberados: [{ pecaId: peca.id, quantidade: 3 }],
      motivo: 'decisão administrativa após falta de fato terminal',
      responsavelId: adminId,
      idempotencyKey: `resolucao:${pendencia.id}`,
    });
    expect(resultado.resolucaoId).toBeDefined();
    expect(
      await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(0);
    const pend = await prisma.pendenciaOs.findUniqueOrThrow({
      where: { id: pendencia.id },
    });
    expect(pend.resolvida).toBe(true);
    expect(pend.resolvidaPorId).toBe(adminId);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe(SituacaoReservaEstoque.CONSUMIDA);
    expect(reserva.quantidadeConsumida).toBe(1);
    expect(reserva.quantidade).toBe(4);
    const estoqueDepois = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    expect(estoqueDepois).toBe(estoqueAntes - 1);
  });

  it('rejeita resolução após consumo automático', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `RM2-${randomUUID().slice(0, 6)}`,
        nome: 'P2',
        precoUnitario: 8,
        quantidadeEstoque: 10,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const eventId = randomUUID();
    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 2 }],
      contextoFato: contextoFatoIntegracao(
        [{ itemId: peca.id, quantidade: 2 }],
        'REPARO_FALHOU',
        eventId,
      ),
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    await expect(
      resolver.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 2 }],
        itensLiberados: [],
        motivo: 'tentativa indevida',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:${pendencia.id}`,
      }),
    ).rejects.toBeInstanceOf(ResolucaoConsumoManualComConsumoAplicadoError);
  });

  it('idempotência com mesma chave', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `RM3-${randomUUID().slice(0, 6)}`,
        nome: 'P3',
        precoUnitario: 5,
        quantidadeEstoque: 8,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const body = {
      pendenciaId: pendencia.id,
      itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
      itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
      motivo: 'idempotente',
      responsavelId: randomUUID(),
      idempotencyKey: `resolucao:idemp:${pendencia.id}`,
    };
    const a = await resolver.execute(body);
    const b = await resolver.execute(body);
    expect(b.reutilizado).toBe(true);
    expect(b.resolucaoId).toBe(a.resolucaoId);
    expect(
      await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
  });

  it('rollback não persiste resolução nem movimentação', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `RB-${randomUUID().slice(0, 6)}`,
        nome: 'Rb',
        precoUnitario: 6,
        quantidadeEstoque: 10,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    await expect(
      unitOfWork.executar(async (ctx) => {
        await resolver.execute(
          {
            pendenciaId: pendencia.id,
            itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
            itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
            motivo: 'rollback',
            responsavelId: randomUUID(),
            idempotencyKey: `resolucao:rb:${pendencia.id}`,
          },
          ctx,
        );
        throw new Error('abortar');
      }),
    ).rejects.toThrow('abortar');
    expect(
      await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id },
      }),
    ).toBe(0);
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
        .quantidadeEstoque,
    ).toBe(fisicoAntes);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe(SituacaoReservaEstoque.ATIVA);
  });

  it('resolução manual concorrente com fato terminal: exclusão mútua', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `CF-${randomUUID().slice(0, 6)}`,
        nome: 'Cf',
        precoUnitario: 5,
        quantidadeEstoque: 15,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const fatoId = randomUUID();
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    let liberar: () => void = () => undefined;
    const trava = new Promise<void>((r) => {
      liberar = r;
    });
    const pFato = (async () => {
      await trava;
      return processar.executar(
        JSON.stringify({
          eventId: fatoId,
          eventType: EVENTO_REPARO_FALHOU,
          version: 1,
          occurredAt: new Date().toISOString(),
          source: 'teste-exclusao',
          correlationId: os.correlationId,
          causationId: null,
          ordemServicoId: os.id,
          rodada: 1,
          payload: {
            pecasUtilizadas: [{ itemId: peca.id, quantidade: 1 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
        }),
      );
    })();
    const pResolucao = (async () => {
      await trava;
      return resolver.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
        motivo: 'concorrente',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:cf:${pendencia.id}`,
      });
    })();
    setTimeout(liberar, 30);
    await Promise.allSettled([pFato, pResolucao]);
    const resolucoes = await prisma.resolucaoConsumoManual.count({
      where: { ordemServicoId: os.id, rodada: 1 },
    });
    const consumos = await prisma.consumoAplicadoOs.count({
      where: { ordemServicoId: os.id, rodada: 1 },
    });
    expect(resolucoes + consumos).toBe(1);
    expect(resolucoes + consumos).toBeGreaterThan(0);
    const fisicoDepois = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    expect(fisicoDepois).toBeLessThanOrEqual(fisicoAntes);
    expect(fisicoDepois).toBeGreaterThanOrEqual(fisicoAntes - 1);
  }, 60_000);

  it('consumo automático vence resolução manual tardia', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `CA-${randomUUID().slice(0, 6)}`,
        nome: 'Ca',
        precoUnitario: 6,
        quantidadeEstoque: 10,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const eventId = randomUUID();
    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 1 }],
      contextoFato: contextoFatoIntegracao(
        [{ itemId: peca.id, quantidade: 1 }],
        'REPARO_FALHOU',
        eventId,
      ),
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    await expect(
      resolver.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [],
        motivo: 'tarde demais',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:ca:${pendencia.id}`,
      }),
    ).rejects.toBeInstanceOf(ResolucaoConsumoManualComConsumoAplicadoError);
    expect(
      await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id },
      }),
    ).toBe(0);
  });

  it('resolução manual concorrente com resposta válida', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `CR-${randomUUID().slice(0, 6)}`,
        nome: 'Cr',
        precoUnitario: 5,
        quantidadeEstoque: 12,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const fatoId = randomUUID();
    let go: () => void = () => undefined;
    const trava = new Promise<void>((r) => {
      go = r;
    });
    const pResposta = (async () => {
      await trava;
      return processar.executar(
        montarEnvelopeE42(
          EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
          os.id,
          os.correlationId,
          1,
          payloadReparoEncerradoE42(peca.id, 1, 'FALHOU', fatoId),
        ),
      );
    })();
    const pResolucao = (async () => {
      await trava;
      return resolver.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
        motivo: 'resposta conc',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:cr:${pendencia.id}`,
      });
    })();
    setTimeout(go, 25);
    await Promise.allSettled([pResposta, pResolucao]);
    expect(
      (await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      })) +
        (await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        })),
    ).toBe(1);
  }, 60_000);

  it('duas resoluções concorrentes não duplicam efeito', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await prisma.peca.create({
      data: {
        codigo: `RC-${randomUUID().slice(0, 6)}`,
        nome: 'Rc',
        precoUnitario: 7,
        quantidadeEstoque: 12,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const pendA = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const prismaB = criarPrismaPool(databaseUrl);
    const resolverB = nestModule.get(ResolverConsumoManualUseCase);
    let go: () => void = () => undefined;
    const trava = new Promise<void>((r) => {
      go = r;
    });
    const p1 = (async () => {
      await trava;
      return resolver.execute({
        pendenciaId: pendA.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
        motivo: 'conc A',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:conc:a:${pendA.id}`,
      });
    })();
    const p2 = (async () => {
      await trava;
      return resolverB.execute({
        pendenciaId: pendA.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
        motivo: 'conc B',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:conc:b:${pendA.id}`,
      });
    })();
    setTimeout(go, 25);
    await Promise.allSettled([p1, p2]);
    await prismaB.$disconnect();
    expect(
      await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBeLessThanOrEqual(1);
  }, 60_000);
});
