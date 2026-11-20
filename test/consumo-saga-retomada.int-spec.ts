import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/shared/generated/prisma/client';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { AjustarEstoqueDivergenciaUseCase } from '@/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';
import { RESERVA_ESTOQUE_GATEWAY } from '@/modules/reservas-estoque/application/ports/tokens';
import type { ReservaEstoqueGateway } from '@/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { PrismaUnitOfWork } from '@/shared/database/prisma-unit-of-work';
import { RETOMADA_SAGA_INVENTARIO } from '@/shared/saga/retomada-saga-inventario.port';
import type { RetomadaSagaInventarioPort } from '@/shared/saga/retomada-saga-inventario.port';
import {
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_FALHOU,
  EVENTO_REPARO_INICIADO,
} from '@/shared/messaging/envelope';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { StatusOS, TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

function criarPrismaPool(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 10000,
  });
  return new PrismaClient({ adapter });
}

describe('Saga — retomada após reconciliação de consumo (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let processar: ProcessarMensagemEntradaService;
  let ajustar: AjustarEstoqueDivergenciaUseCase;
  let criarOs: CriarOrdemServicoUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;

  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let pecaId: string;
  let servicoId: string;

  const montarEnvelope = (
    eventType: string,
    ordemServicoId: string,
    correlationId: string,
    rodada: number,
    payload: Record<string, unknown>,
    eventId = randomUUID(),
  ) =>
    JSON.stringify({
      eventId,
      eventType,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'teste',
      correlationId,
      causationId: null,
      ordemServicoId,
      rodada,
      payload,
    });

  const prepararEmExecucao = async () => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'Retomada consumo',
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: 4 }],
    });
    const correlationId = os.correlationId;
    await processar.executar(
      montarEnvelope(EVENTO_DIAGNOSTICO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#DIAGNOSTICO`,
      }),
    );
    await concluirDiagnostico.execute({
      ordemServicoId: os.id,
      rodada: 1,
      tarefaId: `${os.id}#1#DIAGNOSTICO`,
      laudo: 'Laudo',
      itens: [
        { tipo: 'SERVICO', itemId: servicoId, quantidade: 1 },
        { tipo: 'PECA', itemId: pecaId, quantidade: 4 },
      ],
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelope(EVENTO_ORCAMENTO_GERADO, os.id, correlationId, 1, {
        orcamentoId: randomUUID(),
        valorTotalCentavos: 40000,
      }),
    );
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      orcamentoId: randomUUID(),
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId: `ORD-RET-${sufixo}`,
        valorCentavos: 40000,
      }),
    );
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#REPARO`,
      }),
    );
    return { os, correlationId };
  };

  beforeAll(async () => {
    exigirDatabaseUrl();
    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              OUTBOX_PUBLISHER_HABILITADO: 'false',
              SQS_CONSUMER_HABILITADO: 'false',
            }),
          ],
        }),
        ObservabilityModule,
        IdempotencyModule,
        PrismaModule,
        MensageriaModule,
        CoordenacaoSagaModule,
        OrdensServicoModule,
        ReservasEstoqueModule,
        RotasInternasModule,
      ],
    }).compile();

    prisma = nestModule.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    processar = nestModule.get(ProcessarMensagemEntradaService);
    ajustar = nestModule.get(AjustarEstoqueDivergenciaUseCase);
    criarOs = nestModule.get(CriarOrdemServicoUseCase);
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente retomada ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '3'),
        email: `ret-${sufixo}@test.local`,
        telefone: '11977776666',
      },
    });
    clienteId = cliente.id;
    veiculoId = (
      await prisma.veiculo.create({
        data: {
          clienteId,
          placa: `RT${sufixo.slice(0, 5)}1`.padEnd(7, '1').slice(0, 7),
          modelo: 'Teste',
          marca: 'Marca',
          ano: 2021,
        },
      })
    ).id;
    pecaId = (
      await prisma.peca.create({
        data: {
          codigo: `P-RET-${sufixo}`,
          nome: 'Peça retomada',
          precoUnitario: 25,
          quantidadeEstoque: 50,
        },
      })
    ).id;
    servicoId = (
      await prisma.servico.create({
        data: {
          nome: `Srv ret ${sufixo}`,
          descricao: 'T',
          precoBase: 100,
          tempoEstimadoMin: 20,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  it('divergência mantém EM_EXECUCAO e retoma FINALIZADA com concluidoEm após ajuste', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    const concluidoEm = '2025-09-15T14:30:00.000Z';
    const eventId = randomUUID();
    await processar.executar(
      montarEnvelope(
        EVENTO_REPARO_CONCLUIDO,
        os.id,
        correlationId,
        1,
        {
          concluidoEm,
          pecasUtilizadas: [{ itemId: pecaId, quantidade: 9 }],
          divergencias: [
            {
              itemId: pecaId,
              tipo: 'CONSUMO_ACIMA',
              quantidadePrevista: 4,
              quantidadeUtilizada: 9,
              justificativa: 'A'.repeat(120),
            },
          ],
          responsavelId: 'cognito|mec-01',
        },
        eventId,
      ),
    );
    const interim = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(interim.status).toBe(StatusOS.EM_EXECUCAO);
    const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(consumo.aguardandoFinalizacao).toBe(true);
    expect(consumo.concluidoEm?.toISOString()).toBe(
      new Date(concluidoEm).toISOString(),
    );
    const pendencia = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.id,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const peca = await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } });
    await ajustar.execute({
      pendenciaId: pendencia.id,
      pecaId,
      quantidadeFisicaNova: peca.quantidadeEstoque,
      motivo: 'Conferência física pós divergência',
      responsavelId: randomUUID(),
    });
    const final = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(final.status).toBe(StatusOS.FINALIZADA);
    expect(final.finalizadaEm?.toISOString()).toBe(
      new Date(concluidoEm).toISOString(),
    );
  });

  it('pendência financeira aberta impede finalização após inventário resolvido', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_CONCLUIDO, os.id, correlationId, 1, {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 10 }],
        divergencias: [
          {
            itemId: pecaId,
            tipo: 'CONSUMO_ACIMA',
            quantidadePrevista: 4,
            quantidadeUtilizada: 10,
          },
        ],
      }),
    );
    await prisma.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: os.id,
        rodada: 1,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
        detalhes: { orderId: 'extra' },
      },
    });
    const pendInv = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.id,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const peca = await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } });
    await ajustar.execute({
      pendenciaId: pendInv.id,
      pecaId,
      quantidadeFisicaNova: peca.quantidadeEstoque,
      motivo: 'Ajuste com pendência financeira aberta',
      responsavelId: randomUUID(),
    });
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).toBe(StatusOS.EM_EXECUCAO);
  });

  it('reparo-falhou em EM_CANCELAMENTO persiste consumo sem aguardar finalização', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await prisma.ordemServico.update({
      where: { id: os.id },
      data: { status: StatusOS.EM_CANCELAMENTO },
    });
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_FALHOU, os.id, correlationId, 1, {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
        responsavelId: 'auth0|mec',
      }),
    );
    const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(consumo.tipoFato).toBe('REPARO_FALHOU');
    expect(consumo.aguardandoFinalizacao).toBe(false);
    expect(consumo.responsavelId).toBe('auth0|mec');
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).not.toBe(StatusOS.FINALIZADA);
  });

  it('reparo-falhou em EM_EXECUCAO inicia compensação e persiste consumo', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_FALHOU, os.id, correlationId, 1, {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
        falhouEm: '2026-08-01T09:15:00.000Z',
      }),
    );
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
    expect(ordem.status).not.toBe(StatusOS.FINALIZADA);
    expect(ordem.motivoEncerramento).toBe('Falha do reparo');
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
  });

  it('reentrega com eventId diferente não duplica consumo na rodada', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    const payload = {
      pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
    };
    await processar.executar(
      montarEnvelope(
        EVENTO_REPARO_CONCLUIDO,
        os.id,
        correlationId,
        1,
        payload,
        randomUUID(),
      ),
    );
    await processar.executar(
      montarEnvelope(
        EVENTO_REPARO_CONCLUIDO,
        os.id,
        correlationId,
        1,
        payload,
        randomUUID(),
      ),
    );
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
    expect(await prisma.mensagemProcessada.count()).toBeGreaterThanOrEqual(2);
  });

  it('reentrega concorrente do mesmo reparo-concluido não duplica consumo', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    const eventId = randomUUID();
    const corpo = montarEnvelope(
      EVENTO_REPARO_CONCLUIDO,
      os.id,
      correlationId,
      1,
      { pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }] },
      eventId,
    );
    let iniciou = 0;
    const esperar = new Promise<void>((resolve) => {
      const check = () => {
        iniciou += 1;
        if (iniciou >= 2) resolve();
        else setTimeout(check, 5);
      };
      check();
    });
    const t1 = (async () => {
      await esperar;
      return processar.executar(corpo);
    })();
    const t2 = (async () => {
      await esperar;
      return processar.executar(corpo);
    })();
    await Promise.allSettled([t1, t2]);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
    expect(await prisma.mensagemProcessada.count({ where: { eventId } })).toBe(
      1,
    );
  });

  it('duas resoluções concorrentes da última pendência geram um ajuste', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const { os, correlationId } = await prepararEmExecucao();
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_CONCLUIDO, os.id, correlationId, 1, {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 8 }],
        divergencias: [
          {
            itemId: pecaId,
            tipo: 'CONSUMO_ACIMA',
            quantidadePrevista: 4,
            quantidadeUtilizada: 8,
          },
        ],
      }),
    );
    const pendencia = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.id,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const peca = await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } });
    const gateway = nestModule.get<ReservaEstoqueGateway>(
      RESERVA_ESTOQUE_GATEWAY,
    );
    const retomada = nestModule.get<RetomadaSagaInventarioPort>(
      RETOMADA_SAGA_INVENTARIO,
    );
    const prismaB = criarPrismaPool(databaseUrl);
    const uowB = new PrismaUnitOfWork(
      prismaB as unknown as PrismaService,
      { get: () => '15000' } as never,
    );
    const ajustarB = new AjustarEstoqueDivergenciaUseCase(
      gateway,
      uowB,
      retomada,
    );
    const input = {
      pendenciaId: pendencia.id,
      pecaId,
      quantidadeFisicaNova: peca.quantidadeEstoque,
      responsavelId: randomUUID(),
    };
    const resultados = await Promise.allSettled([
      ajustar.execute({
        ...input,
        motivo: 'Resolução A',
      }),
      ajustarB.execute({
        ...input,
        motivo: 'Resolução B',
      }),
    ]);
    await prismaB.$disconnect();
    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    const erro = resultados.filter((r) => r.status === 'rejected').length;
    expect(ok).toBe(1);
    expect(erro).toBe(1);
    expect(
      await prisma.ajusteEstoqueAdministrativo.count({
        where: { pendenciaId: pendencia.id },
      }),
    ).toBe(1);
  });
});
