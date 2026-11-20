import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
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
import {
  QuantidadeResolucaoManualInvalidaError,
  ResolucaoConsumoManualComConsumoAplicadoError,
} from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
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
import {
  arbitroConcorrente,
  assertOperacaoAindaPendente,
  operacaoConcorrente,
} from './helpers/assert-operacao-pendente';
import { SessaoBloqueioOrdemServico } from './helpers/sessao-bloqueio-ordem-servico';

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
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              DATABASE_POOL_CONNECTION_TIMEOUT_MS: '120000',
            }),
          ],
        }),
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

  it('rejeita peça fora das reservas ativas sem efeito parcial', async () => {
    const peca = await prisma.peca.create({
      data: {
        codigo: `RF-${randomUUID().slice(0, 6)}`,
        nome: 'Reservada',
        precoUnitario: 8,
        quantidadeEstoque: 12,
      },
    });
    const fora = await prisma.peca.create({
      data: {
        codigo: `FF-${randomUUID().slice(0, 6)}`,
        nome: 'Fora',
        precoUnitario: 5,
        quantidadeEstoque: 30,
      },
    });
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const estoqueReservadaAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const estoqueForaAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: fora.id } })
    ).quantidadeEstoque;
    await expect(
      resolver.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [
          { pecaId: peca.id, quantidade: 1 },
          { pecaId: fora.id, quantidade: 1 },
        ],
        itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
        motivo: 'mistura inválida',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:fora:${pendencia.id}`,
      }),
    ).rejects.toBeInstanceOf(QuantidadeResolucaoManualInvalidaError);
    expect(
      await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.pendenciaOs.findUniqueOrThrow({
          where: { id: pendencia.id },
        })
      ).resolvida,
    ).toBe(false);
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
        .quantidadeEstoque,
    ).toBe(estoqueReservadaAntes);
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: fora.id } }))
        .quantidadeEstoque,
    ).toBe(estoqueForaAntes);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe(SituacaoReservaEstoque.ATIVA);
    expect(reserva.quantidadeConsumida ?? 0).toBe(0);
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

  const montarFatoFalhouResolucao = (
    osId: string,
    correlationId: string,
    peca: string,
    eventId: string,
  ) =>
    JSON.stringify({
      eventId,
      eventType: EVENTO_REPARO_FALHOU,
      version: 1,
      occurredAt: QUANDO_ENCERRAMENTO_E42,
      source: 'teste-exclusao',
      correlationId,
      causationId: null,
      ordemServicoId: osId,
      rodada: 1,
      payload: {
        pecasUtilizadas: [{ itemId: peca, quantidade: 1 }],
        falhouEm: QUANDO_ENCERRAMENTO_E42,
      },
    });

  it('concorrência — consumo automático vence resolução manual (fato na frente da fila)', async () => {
    const databaseUrl = exigirDatabaseUrl();
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
    const qtdOriginal = (
      await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      })
    ).quantidade;
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const fatoId = randomUUID();
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
    try {
      await sessao.adquirir();
      const pFato = operacaoConcorrente(
        processar.executar(
          montarFatoFalhouResolucao(os.id, os.correlationId, peca.id, fatoId),
        ),
      );
      const pidsAposPrimeira = await sessao.aguardarDisputaBloqueio(1);
      const pResolucao = operacaoConcorrente(
        resolver.execute({
          pendenciaId: pendencia.id,
          itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
          itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
          motivo: 'perde disputa',
          responsavelId: randomUUID(),
          idempotencyKey: `resolucao:cf:perde:${pendencia.id}`,
        }),
      );
      const arbitro = arbitroConcorrente(pFato, pResolucao);
      await sessao.aguardarAcrescimoDisputa(pidsAposPrimeira);
      await assertOperacaoAindaPendente(pFato);
      await assertOperacaoAindaPendente(pResolucao);
      await sessao.liberar();
      await arbitro;
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
      expect(
        await prisma.resolucaoConsumoManual.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(0);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
          .quantidadeEstoque,
      ).toBe(fisicoAntes - 1);
      const reserva = await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      });
      expect(reserva.quantidade).toBe(qtdOriginal);
      expect(
        (
          await prisma.consumoAplicadoOs.findUniqueOrThrow({
            where: {
              ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 },
            },
          })
        ).eventId,
      ).toBe(fatoId);
    } finally {
      await sessao.descartar();
    }
  }, 90_000);

  it('concorrência — resolução manual vence: bloqueio disputado e fato tardio sem consumo', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await prisma.peca.create({
      data: {
        codigo: `CM-${randomUUID().slice(0, 6)}`,
        nome: 'Cm',
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
    const qtdOriginal = (
      await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      })
    ).quantidade;
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const fatoId = randomUUID();
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
    try {
      await sessao.adquirir();
      const pResolucao = resolver.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
        motivo: 'vence disputa',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:cm:vence:${pendencia.id}`,
      });
      await sessao.aguardarDisputaBloqueio(1);
      await sessao.liberar();
      await pResolucao;
      expect(
        await prisma.resolucaoConsumoManual.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
          .quantidadeEstoque,
      ).toBe(fisicoAntes - 1);
      await processar.executar(
        montarFatoFalhouResolucao(os.id, os.correlationId, peca.id, fatoId),
      );
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(0);
      const resolucao = await prisma.resolucaoConsumoManual.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(resolucao.fatoTardioEventId).toBe(fatoId);
      const reserva = await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      });
      expect(reserva.quantidade).toBe(qtdOriginal);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
          .quantidadeEstoque,
      ).toBe(fisicoAntes - 1);
    } finally {
      await sessao.descartar();
    }
  }, 90_000);

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

  it('concorrência — resposta válida vence resolução manual (resposta na frente da fila)', async () => {
    const databaseUrl = exigirDatabaseUrl();
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
    const qtdOriginal = (
      await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      })
    ).quantidade;
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const fatoId = randomUUID();
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
    try {
      await sessao.adquirir();
      const pResposta = operacaoConcorrente(
        processar.executar(
          montarEnvelopeE42(
            EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
            os.id,
            os.correlationId,
            1,
            payloadReparoEncerradoE42(peca.id, 1, 'FALHOU', fatoId),
          ),
        ),
      );
      const pidsAposPrimeira = await sessao.aguardarDisputaBloqueio(1);
      const pResolucao = operacaoConcorrente(
        resolver.execute({
          pendenciaId: pendencia.id,
          itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
          itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
          motivo: 'perde para resposta',
          responsavelId: randomUUID(),
          idempotencyKey: `resolucao:cr:perde:${pendencia.id}`,
        }),
      );
      const arbitro = arbitroConcorrente(pResposta, pResolucao);
      await sessao.aguardarAcrescimoDisputa(pidsAposPrimeira);
      await assertOperacaoAindaPendente(pResposta);
      await assertOperacaoAindaPendente(pResolucao);
      await sessao.liberar();
      await arbitro;
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
      expect(
        await prisma.resolucaoConsumoManual.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(0);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
          .quantidadeEstoque,
      ).toBe(fisicoAntes - 1);
      const reserva = await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      });
      expect(reserva.quantidade).toBe(qtdOriginal);
    } finally {
      await sessao.descartar();
    }
  }, 90_000);

  it('concorrência — resolução manual vence resposta: bloqueio disputado e resposta tardia compatível', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await prisma.peca.create({
      data: {
        codigo: `CR2-${randomUUID().slice(0, 6)}`,
        nome: 'Cr2',
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
    const qtdOriginal = (
      await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      })
    ).quantidade;
    const pendencia = await abrirPendenciaInformacaoInsuficiente(os.id, 1);
    const fatoId = randomUUID();
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
    try {
      await sessao.adquirir();
      const pResolucao = resolver.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
        motivo: 'vence resposta',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:cr2:vence:${pendencia.id}`,
      });
      await sessao.aguardarDisputaBloqueio(1);
      await sessao.liberar();
      await pResolucao;
      expect(
        await prisma.resolucaoConsumoManual.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
      await processar.executar(
        montarEnvelopeE42(
          EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
          os.id,
          os.correlationId,
          1,
          payloadReparoEncerradoE42(peca.id, 1, 'FALHOU', fatoId),
        ),
      );
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(0);
      const resolucao = await prisma.resolucaoConsumoManual.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(resolucao.fatoTardioEventId).toBe(fatoId);
      const reserva = await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      });
      expect(reserva.quantidade).toBe(qtdOriginal);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
          .quantidadeEstoque,
      ).toBe(fisicoAntes - 1);
    } finally {
      await sessao.descartar();
    }
  }, 90_000);

  it('duas resoluções concorrentes — exatamente uma vence com bloqueio disputado', async () => {
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
    const estoqueAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
    try {
      await sessao.adquirir();
      const pVencedor = operacaoConcorrente(
        resolver.execute({
          pendenciaId: pendA.id,
          itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
          itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
          motivo: 'após liberação do bloqueio',
          responsavelId: randomUUID(),
          idempotencyKey: `resolucao:conc:vence:${pendA.id}`,
        }),
      );
      const pidsAposPrimeira = await sessao.aguardarDisputaBloqueio(1);
      const pBloqueada = operacaoConcorrente(
        resolver.execute({
          pendenciaId: pendA.id,
          itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
          itensLiberados: [{ pecaId: peca.id, quantidade: 1 }],
          motivo: 'bloqueada na OS',
          responsavelId: randomUUID(),
          idempotencyKey: `resolucao:conc:perde:${pendA.id}`,
        }),
      );
      const arbitro = arbitroConcorrente(pBloqueada, pVencedor);
      await sessao.aguardarAcrescimoDisputa(pidsAposPrimeira);
      await assertOperacaoAindaPendente(pVencedor);
      await assertOperacaoAindaPendente(pBloqueada);
      await sessao.liberar();
      const resultados = await arbitro;
      const sucesso = resultados.filter((r) => r.status === 'fulfilled').length;
      const falha = resultados.filter((r) => r.status === 'rejected').length;
      expect(sucesso).toBe(1);
      expect(falha).toBe(1);
      expect(
        await prisma.resolucaoConsumoManual.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
          .quantidadeEstoque,
      ).toBe(estoqueAntes - 1);
    } finally {
      await sessao.descartar();
    }
  }, 90_000);
});
