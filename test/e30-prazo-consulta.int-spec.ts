import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { consultaIdPrazoReferencia } from '@/modules/coordenacao-saga/domain/consulta-financeira';
import { SolicitarConsultaFinanceiraUseCase } from '@/modules/coordenacao-saga/application/use-cases/solicitar-consulta-financeira.use-case';
import { PrismaConsultaPrazoOrdemGateway } from '@/modules/coordenacao-saga/infra/persistence/prisma-consulta-prazo-ordem.gateway';
import { ProcessadorPrazoReferenciaService } from '@/modules/coordenacao-saga/infra/jobs/processador-prazo-referencia.service';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  EVENTO_COBRANCA_CRIADA,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_PAGAMENTO_DISPONIVEL,
  EVENTO_SITUACAO_FINANCEIRA,
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

describe('E30 — prazo, consulta e projeção (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let criarOs: CriarOrdemServicoUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;
  let processar: ProcessarMensagemEntradaService;
  let solicitarConsulta: SolicitarConsultaFinanceiraUseCase;
  let reivindicacao: PrismaConsultaPrazoOrdemGateway;
  let processador: ProcessadorPrazoReferenciaService;

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
      source: 'teste-e30',
      correlationId,
      causationId: null,
      ordemServicoId,
      rodada,
      payload,
    });

  const prepararAguardandoPagamento = async () => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: `E30 ${sufixo}`,
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: 2 }],
    });
    const correlationId = os.correlationId;
    await processar.executar(
      montarEnvelope(EVENTO_DIAGNOSTICO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#DIAGNOSTICO`,
      }),
    );
    const orcamentoId = randomUUID();
    await concluirDiagnostico.execute({
      ordemServicoId: os.id,
      rodada: 1,
      tarefaId: `${os.id}#1#DIAGNOSTICO`,
      laudo: 'Laudo',
      itens: [
        { tipo: 'SERVICO', itemId: servicoId, quantidade: 1 },
        { tipo: 'PECA', itemId: pecaId, quantidade: 2 },
      ],
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelope(EVENTO_ORCAMENTO_GERADO, os.id, correlationId, 1, {
        orcamentoId,
        valorTotalCentavos: 20000,
      }),
    );
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      orcamentoId,
      idempotencyKey: randomUUID(),
    });
    return { os, correlationId, orcamentoId };
  };

  const vencerPrazoReferencia = (ordemServicoId: string) =>
    prisma.ordemServico.update({
      where: { id: ordemServicoId },
      data: { prazoReferenciaReserva: new Date(Date.now() - 60_000) },
    });

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
              PRAZO_REFERENCIA_VERIFICADOR_INTERVAL_MS: '1000',
              PRAZO_REFERENCIA_RECONSULTA_CICLOS: '5',
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
    criarOs = nestModule.get(CriarOrdemServicoUseCase);
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);
    processar = nestModule.get(ProcessarMensagemEntradaService);
    solicitarConsulta = nestModule.get(SolicitarConsultaFinanceiraUseCase);
    reivindicacao = nestModule.get(PrismaConsultaPrazoOrdemGateway);
    processador = nestModule.get(ProcessadorPrazoReferenciaService);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente E30 ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '4'),
        email: `e30-${sufixo}@test.local`,
        telefone: '11966665555',
      },
    });
    clienteId = cliente.id;
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId,
        placa: `E3${sufixo.slice(0, 5).toUpperCase()}`
          .padEnd(7, '0')
          .slice(0, 7),
        modelo: 'Teste',
        marca: 'Marca',
        ano: 2022,
      },
    });
    veiculoId = veiculo.id;
    const peca = await prisma.peca.create({
      data: {
        codigo: `P-E30-${sufixo}`,
        nome: 'Peça E30',
        precoUnitario: 40,
        quantidadeEstoque: 50,
      },
    });
    pecaId = peca.id;
    const servico = await prisma.servico.create({
      data: {
        nome: `Serviço E30 ${sufixo}`,
        descricao: 'Teste',
        precoBase: 100,
        tempoEstimadoMin: 20,
      },
    });
    servicoId = servico.id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  it('projeção de orçamento idempotente por orcamentoId', async () => {
    const { os, correlationId, orcamentoId } =
      await prepararAguardandoPagamento();
    const count = await prisma.projecaoFinanceiraOs.count({
      where: { ordemServicoId: os.id, orcamentoId, natureza: 'ORCAMENTO' },
    });
    expect(count).toBe(1);
    await processar.executar(
      montarEnvelope(EVENTO_ORCAMENTO_GERADO, os.id, correlationId, 1, {
        orcamentoId,
        valorTotalCentavos: 20000,
      }),
    );
    expect(
      await prisma.projecaoFinanceiraOs.count({
        where: { ordemServicoId: os.id, orcamentoId },
      }),
    ).toBe(1);
  });

  it('PAGO_NO_PRAZO após prazo leva a AGUARDANDO_EXECUCAO', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await vencerPrazoReferencia(os.id);
    await solicitarConsulta.execute(os.id);
    const consultaId = consultaIdPrazoReferencia(os.id, 1, 1);
    await processar.executar(
      montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
        consultaId,
        situacaoPagamento: 'PAGO_NO_PRAZO',
        situacaoEstorno: 'NENHUM',
        orderId: `ORD-E30-${sufixo}`,
        valorCentavos: 20000,
      }),
    );
    expect(
      (await prisma.ordemServico.findUnique({ where: { id: os.id } }))?.status,
    ).toBe(StatusOS.AGUARDANDO_EXECUCAO);
  });

  it('INDETERMINADA mantém AGUARDANDO_PAGAMENTO e reserva ATIVA', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await vencerPrazoReferencia(os.id);
    await solicitarConsulta.execute(os.id);
    const consultaId = consultaIdPrazoReferencia(os.id, 1, 1);
    await processar.executar(
      montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
        consultaId,
        situacaoPagamento: 'INDETERMINADA',
        situacaoEstorno: 'NENHUM',
      }),
    );
    expect(
      (await prisma.ordemServico.findUnique({ where: { id: os.id } }))?.status,
    ).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
    const reserva = await prisma.reservaEstoque.findFirst({
      where: {
        ordemServicoId: os.id,
        situacao: SituacaoReservaEstoque.ATIVA,
      },
    });
    expect(reserva).toBeTruthy();
    expect(
      await prisma.pendenciaOs.count({
        where: {
          ordemServicoId: os.id,
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: false,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('consultaId antigo não altera status', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await vencerPrazoReferencia(os.id);
    await solicitarConsulta.execute(os.id);
    await processar.executar(
      montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
        consultaId: 'consulta-antiga',
        situacaoPagamento: 'PAGO_NO_PRAZO',
        situacaoEstorno: 'NENHUM',
      }),
    );
    expect(
      (await prisma.ordemServico.findUnique({ where: { id: os.id } }))?.status,
    ).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
  });

  it('CobrancaCriada notifica pagamento disponível uma vez por orderId', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    const orderId = `ORD-LINK-${sufixo}`;
    const payload = {
      orderId,
      linkPagamento: 'https://pay.example/e30',
      valorCentavos: 20000,
    };
    const envelope = (eventId: string) =>
      montarEnvelope(
        EVENTO_COBRANCA_CRIADA,
        os.id,
        correlationId,
        1,
        payload,
        eventId,
      );
    await processar.executar(envelope(randomUUID()));
    await processar.executar(envelope(randomUUID()));
    expect(
      await prisma.outboxMensagem.count({
        where: { correlationId, eventType: EVENTO_PAGAMENTO_DISPONIVEL },
      }),
    ).toBe(1);
  });

  it('reivindicação SKIP LOCKED evita sobreposição entre réplicas', async () => {
    const { os } = await prepararAguardandoPagamento();
    const posseDistante = new Date(Date.now() + 3_600_000);
    await prisma.ordemServico.updateMany({
      where: {
        status: StatusOS.AGUARDANDO_PAGAMENTO,
        id: { not: os.id },
        prazoReferenciaReserva: { not: null },
      },
      data: { consultaPrazoReivindicadoEm: posseDistante },
    });
    await prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        prazoReferenciaReserva: new Date(0),
        consultaPrazoProximaEm: new Date(0),
        consultaPrazoReivindicadoEm: null,
      },
    });
    const primeiro = await reivindicacao.reivindicarElegiveis(1, 300_000);
    expect(primeiro).toEqual([os.id]);
    const segundo = await reivindicacao.reivindicarElegiveis(1, 300_000);
    expect(segundo).not.toContain(os.id);
    const apos = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
      select: { consultaPrazoReivindicadoEm: true },
    });
    expect(apos.consultaPrazoReivindicadoEm).not.toBeNull();
  });

  it('solicitação do administrador e verificador competem sem consultas duplicadas no mesmo instante', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await vencerPrazoReferencia(os.id);
    await Promise.all([
      solicitarConsulta.execute(os.id),
      processador.processarLote(),
    ]);
    const consultas = await prisma.outboxMensagem.count({
      where: {
        correlationId,
        eventType: COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
      },
    });
    expect(consultas).toBeGreaterThanOrEqual(1);
    expect(consultas).toBeLessThanOrEqual(2);
  });

  describe('administrador × verificador periódico (resultado esperado)', () => {
    const emitidasNaOrdem = async (correlationId: string) =>
      (
        await prisma.outboxMensagem.findMany({
          where: {
            correlationId,
            eventType: COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
          },
          orderBy: { criadoEm: 'asc' },
        })
      ).map(
        (linha) =>
          (linha.envelope as { payload: { consultaId: string } }).payload
            .consultaId,
      );

    // Só a OS do teste fica elegível ao verificador: as demais, de outros testes, recebem posse distante.
    const isolarParaOVerificador = async (ordemServicoId: string) => {
      await prisma.ordemServico.updateMany({
        where: { id: { not: ordemServicoId } },
        data: { consultaPrazoReivindicadoEm: new Date(Date.now() + 3_600_000) },
      });
      await prisma.ordemServico.update({
        where: { id: ordemServicoId },
        data: {
          prazoReferenciaReserva: new Date(0),
          consultaPrazoProximaEm: new Date(0),
          consultaPrazoReivindicadoEm: null,
        },
      });
    };

    const estadoDaConsulta = async (ordemServicoId: string) => {
      const [ordem, estado, pendencias] = await Promise.all([
        prisma.ordemServico.findUniqueOrThrow({
          where: { id: ordemServicoId },
          select: { consultaPrazoTentativa: true },
        }),
        prisma.estadoCompensacaoOs.findUniqueOrThrow({
          where: { ordemServicoId },
          select: { consultaIdVigente: true },
        }),
        prisma.pendenciaOs.findMany({
          where: {
            ordemServicoId,
            tipo: TipoPendenciaOs.FINANCEIRA,
            resolvida: false,
          },
        }),
      ]);
      return {
        tentativa: ordem.consultaPrazoTentativa,
        consultaIdVigente: estado.consultaIdVigente,
        pendenciasDeConsulta: pendencias.filter(
          (p) =>
            (p.detalhes as { natureza?: string }).natureza ===
            'CONSULTA_PRAZO_REFERENCIA',
        ).length,
      };
    };

    it('administrador primeiro: o verificador não emite enquanto há pedido EMITIDO', async () => {
      const { os, correlationId } = await prepararAguardandoPagamento();
      await vencerPrazoReferencia(os.id);

      await expect(solicitarConsulta.execute(os.id)).resolves.toEqual({
        resultado: 'emitida',
      });
      await isolarParaOVerificador(os.id);
      await processador.processarLote();

      const consultaDoAdministrador = consultaIdPrazoReferencia(os.id, 1, 1);
      expect(await emitidasNaOrdem(correlationId)).toEqual([
        consultaDoAdministrador,
      ]);
      expect(await estadoDaConsulta(os.id)).toEqual({
        tentativa: 1,
        consultaIdVigente: consultaDoAdministrador,
        pendenciasDeConsulta: 1,
      });

      await prisma.ordemServico.update({
        where: { id: os.id },
        data: { consultaPrazoReivindicadoEm: new Date(Date.now() + 3_600_000) },
      });
    });

    it('verificador primeiro: o pedido do administrador cria tentativa e consultaId novos', async () => {
      const { os, correlationId } = await prepararAguardandoPagamento();
      await vencerPrazoReferencia(os.id);
      await isolarParaOVerificador(os.id);

      await processador.processarLote();
      await expect(solicitarConsulta.execute(os.id)).resolves.toEqual({
        resultado: 'emitida',
      });

      const consultaDoVerificador = consultaIdPrazoReferencia(os.id, 1, 1);
      const consultaDoAdministrador = consultaIdPrazoReferencia(os.id, 1, 2);
      expect(await emitidasNaOrdem(correlationId)).toEqual([
        consultaDoVerificador,
        consultaDoAdministrador,
      ]);
      expect(await estadoDaConsulta(os.id)).toEqual({
        tentativa: 2,
        consultaIdVigente: consultaDoAdministrador,
        pendenciasDeConsulta: 1,
      });

      await prisma.ordemServico.update({
        where: { id: os.id },
        data: { consultaPrazoReivindicadoEm: new Date(Date.now() + 3_600_000) },
      });
    });

    it('resposta da consulta do verificador, depois do pedido do administrador, não altera a OS', async () => {
      const { os, correlationId } = await prepararAguardandoPagamento();
      await vencerPrazoReferencia(os.id);
      await isolarParaOVerificador(os.id);
      await processador.processarLote();
      await solicitarConsulta.execute(os.id);

      await processar.executar(
        montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
          consultaId: consultaIdPrazoReferencia(os.id, 1, 1),
          situacaoPagamento: 'PAGO_NO_PRAZO',
          situacaoEstorno: 'NENHUM',
          orderId: `ORD-CONC-${sufixo}`,
          valorCentavos: 20000,
        }),
      );

      expect(
        (await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } }))
          .status,
      ).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
      expect((await estadoDaConsulta(os.id)).consultaIdVigente).toBe(
        consultaIdPrazoReferencia(os.id, 1, 2),
      );

      await prisma.ordemServico.update({
        where: { id: os.id },
        data: { consultaPrazoReivindicadoEm: new Date(Date.now() + 3_600_000) },
      });
    });

    it('em disputa real, o estado final é coerente com a ordem de emissão (1 ou 2 consultas)', async () => {
      const { os, correlationId } = await prepararAguardandoPagamento();
      await vencerPrazoReferencia(os.id);
      await isolarParaOVerificador(os.id);

      await Promise.all([
        solicitarConsulta.execute(os.id),
        processador.processarLote(),
      ]);

      const emitidas = await emitidasNaOrdem(correlationId);
      expect([1, 2]).toContain(emitidas.length);
      expect(emitidas).toEqual(
        emitidas.map((_, indice) =>
          consultaIdPrazoReferencia(os.id, 1, indice + 1),
        ),
      );
      expect(await estadoDaConsulta(os.id)).toEqual({
        tentativa: emitidas.length,
        consultaIdVigente: emitidas[emitidas.length - 1],
        pendenciasDeConsulta: 1,
      });

      await prisma.ordemServico.update({
        where: { id: os.id },
        data: { consultaPrazoReivindicadoEm: new Date(Date.now() + 3_600_000) },
      });
    });
  });

  it('posse da reivindicação usa o relógio do banco e vence depois de PRAZO_REFERENCIA_REIVINDICACAO_MS', async () => {
    const { os } = await prepararAguardandoPagamento();
    await prisma.ordemServico.updateMany({
      where: { id: { not: os.id } },
      data: { consultaPrazoReivindicadoEm: new Date(Date.now() + 3_600_000) },
    });
    await prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        prazoReferenciaReserva: new Date(0),
        consultaPrazoProximaEm: new Date(0),
        consultaPrazoReivindicadoEm: null,
      },
    });

    await expect(
      reivindicacao.reivindicarElegiveis(1, 150_000),
    ).resolves.toEqual([os.id]);

    const [{ segundos }] = await prisma.$queryRaw<{ segundos: number }[]>`
      SELECT EXTRACT(EPOCH FROM (consulta_prazo_reivindicado_em - NOW()))::float AS segundos
      FROM ordens_servico WHERE id = ${os.id}::uuid`;
    expect(segundos).toBeGreaterThan(149);
    expect(segundos).toBeLessThanOrEqual(150);
  });

  it('verificador periódico emite consulta com correlationId da OS', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        prazoReferenciaReserva: new Date(0),
        consultaPrazoProximaEm: new Date(0),
        consultaPrazoReivindicadoEm: null,
      },
    });
    await processador.processarLote();
    expect(
      await prisma.outboxMensagem.count({
        where: {
          correlationId,
          eventType: COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
  });
});
