import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ResolverConsumoManualUseCase } from '@/modules/reservas-estoque/application/use-cases/resolver-consumo-manual.use-case';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { RegistrarDesistenciaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-desistencia.use-case';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_INICIADO,
} from '@/shared/messaging/envelope';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import {
  SituacaoReservaEstoque,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';
import {
  EVENTOS_TERMINAIS_E42,
  contarPendenciaNatureza,
  montarEnvelopeE42,
  payloadDiagnosticoE42,
  payloadReparoCanceladoE42,
  payloadReparoConcluidoE42,
  payloadReparoEncerradoE42,
  QUANDO_ENCERRAMENTO_E42,
} from './helpers/e42-envelope';
import {
  arbitroConcorrente,
  assertOperacaoAindaPendente,
  operacaoConcorrente,
} from './helpers/assert-operacao-pendente';
import { SessaoBloqueioOrdemServico } from './helpers/sessao-bloqueio-ordem-servico';

describe('E42 — resposta cancelamento e auditoria (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let processar: ProcessarMensagemEntradaService;
  let criarOs: CriarOrdemServicoUseCase;
  let desistir: RegistrarDesistenciaUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;
  let resolverManual: ResolverConsumoManualUseCase;

  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let pecaId: string;
  let servicoId: string;

  const contarOutbox = (correlationId: string, eventType: string) =>
    prisma.outboxMensagem.count({ where: { correlationId, eventType } });

  const prepararEmCancelamentoReparo = async (pecaQtd = 3) => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: `E42 ${sufixo}`,
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: pecaQtd }],
    });
    const correlationId = os.correlationId;
    await processar.executar(
      montarEnvelopeE42(EVENTO_DIAGNOSTICO_INICIADO, os.id, correlationId, 1, {
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
        { tipo: 'PECA', itemId: pecaId, quantidade: pecaQtd },
      ],
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelopeE42(EVENTO_ORCAMENTO_GERADO, os.id, correlationId, 1, {
        orcamentoId: randomUUID(),
        valorTotalCentavos: 50000,
      }),
    );
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      orcamentoId: randomUUID(),
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelopeE42(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId: `ORD-E42-${sufixo}`,
        valorCentavos: 50000,
      }),
    );
    await processar.executar(
      montarEnvelopeE42(EVENTO_REPARO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#REPARO`,
      }),
    );
    await desistir.execute(os.id, { motivo: 'Cancelamento E42' });
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
    return { os, correlationId, pecaQtd };
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
              DATABASE_POOL_CONNECTION_TIMEOUT_MS: '120000',
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
    criarOs = nestModule.get(CriarOrdemServicoUseCase);
    desistir = nestModule.get(RegistrarDesistenciaUseCase);
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);
    resolverManual = nestModule.get(ResolverConsumoManualUseCase);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente E42 ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '7'),
        email: `e42-${sufixo}@test.local`,
        telefone: '11977776666',
      },
    });
    clienteId = cliente.id;
    veiculoId = (
      await prisma.veiculo.create({
        data: {
          clienteId,
          placa: `E4${sufixo.slice(0, 4)}`.padEnd(7, '2').slice(0, 7),
          modelo: 'E42',
          marca: 'Marca',
          ano: 2023,
        },
      })
    ).id;
    pecaId = (
      await prisma.peca.create({
        data: {
          codigo: `P-E42-${sufixo}`,
          nome: 'Peça E42',
          precoUnitario: 25,
          quantidadeEstoque: 100,
        },
      })
    ).id;
    servicoId = (
      await prisma.servico.create({
        data: {
          nome: `Srv E42 ${sufixo}`,
          descricao: 'T',
          precoBase: 90,
          tempoEstimadoMin: 20,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  describe('convergência', () => {
    it('fato terminal antes da resposta com mesma auditoria', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const estoqueAntes = await prisma.peca.findUniqueOrThrow({
        where: { id: pecaId },
      });
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
          QUANDO_ENCERRAMENTO_E42,
        ),
      );
      const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(consumo.eventId).toBe(fatoId);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 1, 'FALHOU', fatoId),
        ),
      );
      const depois = await prisma.consumoAplicadoOs.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(depois.id).toBe(consumo.id);
      expect(depois.eventId).toBe(fatoId);
      const estoqueDepois = await prisma.peca.findUniqueOrThrow({
        where: { id: pecaId },
      });
      expect(estoqueDepois.quantidadeEstoque).toBe(
        estoqueAntes.quantidadeEstoque - 1,
      );
      expect(
        await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO),
      ).toBe(1);
    });

    it('motivo só na resposta converge sem CONFLITO_CONSUMO', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const fatoId = randomUUID();
      const estoqueAntes = (
        await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
      ).quantidadeEstoque;
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_INTERROMPIDO,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
            interrompidaEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
          QUANDO_ENCERRAMENTO_E42,
        ),
      );
      const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(consumo.eventId).toBe(fatoId);
      expect(consumo.tipoFato).toBe('REPARO_INTERROMPIDO');
      const financeiroPosFato = await contarOutbox(
        correlationId,
        COMANDO_CANCELAR_FINANCEIRO,
      );
      const estoquePosFato = (
        await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
      ).quantidadeEstoque;
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(
            pecaId,
            1,
            'INTERROMPIDA',
            fatoId,
            'motivo informado somente na resposta de cancelamento',
          ),
        ),
      );
      const consumoDepois = await prisma.consumoAplicadoOs.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(consumoDepois.id).toBe(consumo.id);
      expect(consumoDepois.eventId).toBe(fatoId);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(0);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
          .quantidadeEstoque,
      ).toBe(estoquePosFato);
      expect(estoquePosFato).toBe(estoqueAntes - 1);
      expect(
        await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO),
      ).toBe(financeiroPosFato);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
    });

    it('resposta antes do fato terminal', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(3);
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoConcluidoE42(pecaId, 2, fatoId),
        ),
      );
      const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(consumo.eventId).toBe(fatoId);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_CONCLUIDO,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
            concluidoEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
        ),
      );
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
    });

    it('reentrega compatível não duplica consumo nem comando', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const fatoId = randomUUID();
      const corpo = montarEnvelopeE42(
        EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
        os.id,
        correlationId,
        1,
        {
          pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
          falhouEm: QUANDO_ENCERRAMENTO_E42,
        },
        fatoId,
      );
      await processar.executar(corpo);
      await processar.executar(corpo);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
      expect(
        await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO),
      ).toBe(1);
    });

    it('mesmo fatoTerminalEventId com conteúdo incompatível abre CONFLITO_CONSUMO', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(4);
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
        ),
      );
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 3, 'FALHOU', fatoId),
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(1);
      const reentrega = await contarPendenciaNatureza(
        prisma,
        os.id,
        'CONFLITO_CONSUMO',
      );
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 3, 'FALHOU', fatoId),
          randomUUID(),
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(reentrega);
    });

    it('equivalência semântica com itens repetidos na resposta', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(3);
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
        ),
      );
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          {
            ...payloadReparoEncerradoE42(pecaId, 2, 'FALHOU', fatoId),
            pecasUtilizadas: [
              { itemId: pecaId, quantidade: 1 },
              { itemId: pecaId, quantidade: 1 },
            ],
          },
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(0);
    });

    it('fatos terminais distintos para mesma OS e rodada', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          randomUUID(),
        ),
      );
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          randomUUID(),
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('informação insuficiente', () => {
    it('resposta JA_ENCERRADA sem fatoTerminalEventId abre pendência única', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const reservasAntes = await prisma.reservaEstoque.findMany({
        where: {
          ordemServicoId: os.id,
          situacao: SituacaoReservaEstoque.ATIVA,
        },
      });
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          {
            tipoTarefa: 'REPARO',
            resultado: 'JA_ENCERRADA',
            situacaoTarefa: 'FALHOU',
            encerradaEm: QUANDO_ENCERRAMENTO_E42,
            motivo: 'sem fato',
            pecasUtilizadas: [],
            servicosRealizados: [],
            divergencias: [],
          },
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'INFORMACAO_INSUFICIENTE'),
      ).toBe(1);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(0);
      const reservasDepois = await prisma.reservaEstoque.findMany({
        where: {
          ordemServicoId: os.id,
          situacao: SituacaoReservaEstoque.ATIVA,
        },
      });
      expect(reservasDepois).toEqual(reservasAntes);
    });

    it('CANCELADA antes da execução sem pendência', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoCanceladoE42(),
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'INFORMACAO_INSUFICIENTE'),
      ).toBe(0);
    });

    it('fato posterior resolve pendência de informação insuficiente', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          {
            tipoTarefa: 'REPARO',
            resultado: 'JA_ENCERRADA',
            situacaoTarefa: 'FALHOU',
            encerradaEm: QUANDO_ENCERRAMENTO_E42,
            motivo: 'falha',
            pecasUtilizadas: [],
            servicosRealizados: [],
            divergencias: [],
          },
        ),
      );
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'INFORMACAO_INSUFICIENTE'),
      ).toBe(0);
      const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(consumo.eventId).toBe(fatoId);
    });

    it('fato com CONSUMO_ACIMA resolve informação insuficiente e abre divergência física', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const estoqueAntes = (
        await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
      ).quantidadeEstoque;
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          {
            tipoTarefa: 'REPARO',
            resultado: 'JA_ENCERRADA',
            situacaoTarefa: 'FALHOU',
            encerradaEm: QUANDO_ENCERRAMENTO_E42,
            motivo: 'falha',
            pecasUtilizadas: [],
            servicosRealizados: [],
            divergencias: [],
          },
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'INFORMACAO_INSUFICIENTE'),
      ).toBe(1);
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 3 }],
            divergencias: [
              {
                itemId: pecaId,
                tipo: 'CONSUMO_ACIMA',
                quantidadePrevista: 2,
                quantidadeUtilizada: 3,
                justificativa: 'uso acima do reservado',
              },
            ],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
          QUANDO_ENCERRAMENTO_E42,
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'INFORMACAO_INSUFICIENTE'),
      ).toBe(0);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'DIVERGENCIA_CONSUMO'),
      ).toBe(1);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(1);
      const consumo = await prisma.consumoAplicadoOs.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(consumo.situacaoReconciliacao).toBe('DIVERGENCIA_PENDENTE');
      expect(consumo.eventId).toBe(fatoId);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
          .quantidadeEstoque,
      ).toBe(estoqueAntes - 2);
    });

    it('fato com peça fora da reserva abre divergência sem baixa indevida', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(1);
      const outraPeca = await prisma.peca.create({
        data: {
          codigo: `FORA-${randomUUID().slice(0, 6)}`,
          nome: 'Fora reserva',
          precoUnitario: 10,
          quantidadeEstoque: 50,
        },
      });
      const estoqueOutraAntes = outraPeca.quantidadeEstoque;
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          {
            tipoTarefa: 'REPARO',
            resultado: 'JA_ENCERRADA',
            situacaoTarefa: 'FALHOU',
            encerradaEm: QUANDO_ENCERRAMENTO_E42,
            motivo: 'falha',
            pecasUtilizadas: [],
            servicosRealizados: [],
            divergencias: [],
          },
        ),
      );
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [
              { itemId: pecaId, quantidade: 1 },
              { itemId: outraPeca.id, quantidade: 1 },
            ],
            divergencias: [
              {
                itemId: outraPeca.id,
                tipo: 'FORA_DA_LISTA',
                quantidadePrevista: 0,
                quantidadeUtilizada: 1,
                justificativa: 'peça não reservada',
              },
            ],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
          QUANDO_ENCERRAMENTO_E42,
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'INFORMACAO_INSUFICIENTE'),
      ).toBe(0);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'DIVERGENCIA_CONSUMO'),
      ).toBe(1);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: outraPeca.id } }))
          .quantidadeEstoque,
      ).toBe(estoqueOutraAntes);
    });

    it('cenário D — naturezas distintas coexistem; só a causa eliminada resolve', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          {
            tipoTarefa: 'REPARO',
            resultado: 'JA_ENCERRADA',
            situacaoTarefa: 'FALHOU',
            encerradaEm: QUANDO_ENCERRAMENTO_E42,
            motivo: 'falha',
            pecasUtilizadas: [],
            servicosRealizados: [],
            divergencias: [],
          },
        ),
      );
      const pendRodada2 = await prisma.pendenciaOs.create({
        data: {
          id: randomUUID(),
          ordemServicoId: os.id,
          rodada: 2,
          tipo: TipoPendenciaOs.INVENTARIO,
          detalhes: { natureza: 'INFORMACAO_INSUFICIENTE', conteudo: {} },
        },
      });
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 3 }],
            divergencias: [
              {
                itemId: pecaId,
                tipo: 'CONSUMO_ACIMA',
                quantidadePrevista: 2,
                quantidadeUtilizada: 3,
                justificativa: 'acima',
              },
            ],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          fatoId,
        ),
      );
      expect(
        await prisma.pendenciaOs.count({
          where: {
            ordemServicoId: os.id,
            rodada: 1,
            resolvida: false,
            tipo: TipoPendenciaOs.INVENTARIO,
            detalhes: { path: ['natureza'], equals: 'INFORMACAO_INSUFICIENTE' },
          },
        }),
      ).toBe(0);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'DIVERGENCIA_CONSUMO'),
      ).toBe(1);
      expect(
        await prisma.pendenciaOs.count({
          where: {
            ordemServicoId: os.id,
            rodada: 2,
            resolvida: false,
            tipo: TipoPendenciaOs.INVENTARIO,
            detalhes: { path: ['natureza'], equals: 'INFORMACAO_INSUFICIENTE' },
          },
        }),
      ).toBe(1);
      const divergencia = await prisma.pendenciaOs.findFirstOrThrow({
        where: {
          ordemServicoId: os.id,
          rodada: 1,
          resolvida: false,
          tipo: TipoPendenciaOs.INVENTARIO,
        },
      });
      expect((divergencia.detalhes as { natureza?: string }).natureza).toBe(
        'DIVERGENCIA_CONSUMO',
      );
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 2, 'FALHOU', randomUUID()),
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(1);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'DIVERGENCIA_CONSUMO'),
      ).toBe(1);
      expect(
        (
          await prisma.pendenciaOs.findUniqueOrThrow({
            where: { id: pendRodada2.id },
          })
        ).resolvida,
      ).toBe(false);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 9, 'FALHOU', randomUUID()),
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(1);
    });
  });

  describe('resposta após resolução manual (cenário F)', () => {
    async function pendenciaInformacaoRodada1(osId: string) {
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          osId,
          (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } }))
            .correlationId,
          1,
          {
            tipoTarefa: 'REPARO',
            resultado: 'JA_ENCERRADA',
            situacaoTarefa: 'FALHOU',
            encerradaEm: QUANDO_ENCERRAMENTO_E42,
            motivo: 'sem fato',
            pecasUtilizadas: [],
            servicosRealizados: [],
            divergencias: [],
          },
        ),
      );
      return prisma.pendenciaOs.findFirstOrThrow({
        where: {
          ordemServicoId: osId,
          rodada: 1,
          tipo: TipoPendenciaOs.INVENTARIO,
          resolvida: false,
        },
      });
    }

    it('resposta compatível grava fato tardio sem nova baixa nem conflito', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const pendencia = await pendenciaInformacaoRodada1(os.id);
      await resolverManual.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId, quantidade: 1 }],
        itensLiberados: [{ pecaId, quantidade: 1 }],
        motivo: 'manual antes da resposta',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:f:${pendencia.id}`,
      });
      const estoqueAposManual = (
        await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
      ).quantidadeEstoque;
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 1, 'FALHOU', fatoId),
        ),
      );
      const resolucao = await prisma.resolucaoConsumoManual.findUniqueOrThrow({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(resolucao.fatoTardioEventId).toBe(fatoId);
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(0);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
          .quantidadeEstoque,
      ).toBe(estoqueAposManual);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 1, 'FALHOU', fatoId),
        ),
      );
      expect(
        (
          await prisma.resolucaoConsumoManual.findUniqueOrThrow({
            where: { id: resolucao.id },
          })
        ).fatoTardioEventId,
      ).toBe(fatoId);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(0);
    });

    it('resposta incompatível abre CONFLITO_CONSUMO sem duplicar na reentrega', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const pendencia = await pendenciaInformacaoRodada1(os.id);
      await resolverManual.execute({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId, quantidade: 1 }],
        itensLiberados: [{ pecaId, quantidade: 1 }],
        motivo: 'manual',
        responsavelId: randomUUID(),
        idempotencyKey: `resolucao:f2:${pendencia.id}`,
      });
      const fatoId = randomUUID();
      const incompativel = montarEnvelopeE42(
        EVENTOS_TERMINAIS_E42.RESPOSTA,
        os.id,
        correlationId,
        1,
        payloadReparoEncerradoE42(pecaId, 2, 'FALHOU', fatoId),
      );
      await processar.executar(incompativel);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(1);
      const fisico = (
        await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
      ).quantidadeEstoque;
      await processar.executar(incompativel);
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
      ).toBe(1);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
          .quantidadeEstoque,
      ).toBe(fisico);
    });
  });

  describe('contratos aditivos', () => {
    it('diagnóstico JA_CONCLUIDA não gera consumo nem E10', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadDiagnosticoE42('JA_CONCLUIDA'),
        ),
      );
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: os.id, rodada: 1 },
        }),
      ).toBe(0);
    });

    it('REPARO INTERROMPIDA com contrato aditivo aplica consumo', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      const fatoId = randomUUID();
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 1, 'INTERROMPIDA', fatoId),
        ),
      );
      const consumo = await prisma.consumoAplicadoOs.findUnique({
        where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
      });
      expect(consumo?.eventId).toBe(fatoId);
      expect(consumo?.tipoFato).toBe('REPARO_INTERROMPIDO');
    });

    it('resposta legada incompleta de reparo gera INFORMACAO_INSUFICIENTE', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(1);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          {
            tipoTarefa: 'REPARO',
            resultado: 'JA_ENCERRADA',
            situacaoTarefa: 'FALHOU',
            encerradaEm: QUANDO_ENCERRAMENTO_E42,
            motivo: 'legado',
            pecasUtilizadas: [],
            servicosRealizados: [],
            divergencias: [],
          },
        ),
      );
      expect(
        await contarPendenciaNatureza(prisma, os.id, 'INFORMACAO_INSUFICIENTE'),
      ).toBe(1);
    });
  });

  describe('concorrência', () => {
    async function assertFatoRespostaConvergem(
      osId: string,
      estoqueAntes: number,
      qtdConsumo: number,
    ) {
      expect(
        await prisma.consumoAplicadoOs.count({
          where: { ordemServicoId: osId, rodada: 1 },
        }),
      ).toBe(1);
      expect(
        (await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } }))
          .quantidadeEstoque,
      ).toBe(estoqueAntes - qtdConsumo);
    }

    it('fato vence disputa — fato na frente da fila de bloqueio da OS', async () => {
      const databaseUrl = exigirDatabaseUrl();
      const qtd = 2;
      const { os, correlationId } = await prepararEmCancelamentoReparo(3);
      const fatoId = randomUUID();
      const estoqueAntes = (
        await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
      ).quantidadeEstoque;
      const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
      try {
        await sessao.adquirir();
        const pFato = operacaoConcorrente(
          processar.executar(
            montarEnvelopeE42(
              EVENTOS_TERMINAIS_E42.REPARO_CONCLUIDO,
              os.id,
              correlationId,
              1,
              {
                pecasUtilizadas: [{ itemId: pecaId, quantidade: qtd }],
                concluidoEm: QUANDO_ENCERRAMENTO_E42,
              },
              fatoId,
            ),
          ),
        );
        const pidsAposPrimeira = await sessao.aguardarDisputaBloqueio(1);
        const pResposta = operacaoConcorrente(
          processar.executar(
            montarEnvelopeE42(
              EVENTOS_TERMINAIS_E42.RESPOSTA,
              os.id,
              correlationId,
              1,
              payloadReparoConcluidoE42(pecaId, qtd, fatoId),
            ),
          ),
        );
        const arbitro = arbitroConcorrente(pFato, pResposta);
        await sessao.aguardarAcrescimoDisputa(pidsAposPrimeira);
        await assertOperacaoAindaPendente(pFato);
        await assertOperacaoAindaPendente(pResposta);
        await sessao.liberar();
        await arbitro;
        await assertFatoRespostaConvergem(os.id, estoqueAntes, qtd);
      } finally {
        await sessao.descartar();
      }
    }, 90_000);

    it('resposta vence disputa — resposta na frente da fila de bloqueio da OS', async () => {
      const databaseUrl = exigirDatabaseUrl();
      const qtd = 2;
      const { os, correlationId } = await prepararEmCancelamentoReparo(3);
      const fatoId = randomUUID();
      const estoqueAntes = (
        await prisma.peca.findUniqueOrThrow({ where: { id: pecaId } })
      ).quantidadeEstoque;
      const sessao = new SessaoBloqueioOrdemServico(databaseUrl, os.id);
      try {
        await sessao.adquirir();
        const pResposta = operacaoConcorrente(
          processar.executar(
            montarEnvelopeE42(
              EVENTOS_TERMINAIS_E42.RESPOSTA,
              os.id,
              correlationId,
              1,
              payloadReparoConcluidoE42(pecaId, qtd, fatoId),
            ),
          ),
        );
        const pidsAposPrimeira = await sessao.aguardarDisputaBloqueio(1);
        const pFato = operacaoConcorrente(
          processar.executar(
            montarEnvelopeE42(
              EVENTOS_TERMINAIS_E42.REPARO_CONCLUIDO,
              os.id,
              correlationId,
              1,
              {
                pecasUtilizadas: [{ itemId: pecaId, quantidade: qtd }],
                concluidoEm: QUANDO_ENCERRAMENTO_E42,
              },
              fatoId,
            ),
          ),
        );
        const arbitro = arbitroConcorrente(pResposta, pFato);
        await sessao.aguardarAcrescimoDisputa(pidsAposPrimeira);
        await assertOperacaoAindaPendente(pResposta);
        await assertOperacaoAindaPendente(pFato);
        await sessao.liberar();
        await arbitro;
        await assertFatoRespostaConvergem(os.id, estoqueAntes, qtd);
      } finally {
        await sessao.descartar();
      }
    }, 90_000);
  });

  describe('estado terminal', () => {
    it('conflito com OS em EM_CANCELAMENTO não regressa para FINALIZADA', async () => {
      const { os, correlationId } = await prepararEmCancelamentoReparo(2);
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.REPARO_FALHOU,
          os.id,
          correlationId,
          1,
          {
            pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
            falhouEm: QUANDO_ENCERRAMENTO_E42,
          },
          randomUUID(),
        ),
      );
      await processar.executar(
        montarEnvelopeE42(
          EVENTOS_TERMINAIS_E42.RESPOSTA,
          os.id,
          correlationId,
          1,
          payloadReparoEncerradoE42(pecaId, 2, 'FALHOU', randomUUID()),
        ),
      );
      const ordem = await prisma.ordemServico.findUniqueOrThrow({
        where: { id: os.id },
      });
      expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
      expect(ordem.status).not.toBe(StatusOS.FINALIZADA);
      expect(
        await prisma.pendenciaOs.count({
          where: { ordemServicoId: os.id, tipo: TipoPendenciaOs.INVENTARIO },
        }),
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
