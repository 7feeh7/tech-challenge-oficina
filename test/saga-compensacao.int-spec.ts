import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import {
  consultaIdExcecaoE10,
  consultaIdPrazoReferencia,
} from '@/modules/coordenacao-saga/domain/consulta-financeira';
import { SolicitarConsultaFinanceiraUseCase } from '@/modules/coordenacao-saga/application/use-cases/solicitar-consulta-financeira.use-case';
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
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  EVENTO_COBRANCA_EXPIRADA,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_INICIADO,
  EVENTO_RESPOSTA_CANCELAMENTO,
  EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
  EVENTO_SITUACAO_FINANCEIRA,
  EVENTO_PENDENCIA_RESOLVIDA,
} from '@/shared/messaging/envelope';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import {
  PassoCompensacaoSaga,
  SituacaoReservaEstoque,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('Saga — compensação (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let criarOs: CriarOrdemServicoUseCase;
  let desistir: RegistrarDesistenciaUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;
  let processar: ProcessarMensagemEntradaService;
  let solicitarConsulta: SolicitarConsultaFinanceiraUseCase;

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
      source: 'teste-compensacao',
      correlationId,
      causationId: null,
      ordemServicoId,
      rodada,
      payload,
    });

  const contarOutbox = (correlationId: string, eventType: string) =>
    prisma.outboxMensagem.count({
      where: { correlationId, eventType },
    });

  const ordemOutbox = async (correlationId: string) => {
    const linhas = await prisma.outboxMensagem.findMany({
      where: {
        correlationId,
        eventType: {
          in: [
            COMANDO_CANCELAR_TAREFA,
            COMANDO_CANCELAR_FINANCEIRO,
            COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
          ],
        },
      },
      orderBy: { criadoEm: 'asc' },
      select: { eventType: true, criadoEm: true },
    });
    return linhas.map((l) => l.eventType);
  };

  const prepararAguardandoPagamento = async (pecaQtd = 2) => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: `Compensação ${sufixo}`,
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: pecaQtd }],
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
        { tipo: 'PECA', itemId: pecaId, quantidade: pecaQtd },
      ],
      idempotencyKey: randomUUID(),
    });
    await processar.executar(
      montarEnvelope(EVENTO_ORCAMENTO_GERADO, os.id, correlationId, 1, {
        orcamentoId: randomUUID(),
        valorTotalCentavos: 20000,
      }),
    );
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      orcamentoId: randomUUID(),
      idempotencyKey: randomUUID(),
    });
    return { os, correlationId };
  };

  const prepararEmExecucao = async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId: `ORD-${sufixo}`,
        valorCentavos: 20000,
      }),
    );
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#REPARO`,
      }),
    );
    return { os, correlationId };
  };

  const simularRespostaFinanceiro = (
    osId: string,
    correlationId: string,
    rodada: number,
    resultado: string,
    eventId?: string,
  ) =>
    processar.executar(
      montarEnvelope(
        EVENTO_RESPOSTA_CANCELAMENTO,
        osId,
        correlationId,
        rodada,
        { resultado },
        eventId,
      ),
    );

  const simularRespostaExecucao = (
    osId: string,
    correlationId: string,
    rodada: number,
    payload: Record<string, unknown>,
    eventId?: string,
  ) =>
    processar.executar(
      montarEnvelope(
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        osId,
        correlationId,
        rodada,
        payload,
        eventId,
      ),
    );

  const concluirCancelamentoPadrao = async (
    osId: string,
    correlationId: string,
    rodada: number,
    opts?: {
      execucao?: Record<string, unknown>;
      financeiro?: string;
    },
  ) => {
    if ((await contarOutbox(correlationId, COMANDO_CANCELAR_TAREFA)) > 0) {
      await simularRespostaExecucao(
        osId,
        correlationId,
        rodada,
        opts?.execucao ?? {
          tipoTarefa: 'DIAGNOSTICO',
          resultado: 'JA_CONCLUIDA',
        },
      );
    }
    if ((await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)) > 0) {
      await simularRespostaFinanceiro(
        osId,
        correlationId,
        rodada,
        opts?.financeiro ?? 'NADA_A_CANCELAR',
      );
    }
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
    criarOs = nestModule.get(CriarOrdemServicoUseCase);
    desistir = nestModule.get(RegistrarDesistenciaUseCase);
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);
    processar = nestModule.get(ProcessarMensagemEntradaService);
    solicitarConsulta = nestModule.get(SolicitarConsultaFinanceiraUseCase);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente comp ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '3'),
        email: `comp-${sufixo}@test.local`,
        telefone: '11977776666',
      },
    });
    clienteId = cliente.id;
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId,
        placa: `CP${sufixo.slice(0, 5).toUpperCase()}`
          .padEnd(7, '2')
          .slice(0, 7),
        modelo: 'Teste',
        marca: 'Marca',
        ano: 2021,
      },
    });
    veiculoId = veiculo.id;
    const peca = await prisma.peca.create({
      data: {
        codigo: `P-COMP-${sufixo}`,
        nome: 'Peça comp',
        precoUnitario: 40,
        quantidadeEstoque: 50,
      },
    });
    pecaId = peca.id;
    const servico = await prisma.servico.create({
      data: {
        nome: `Serviço comp ${sufixo}`,
        descricao: 'Teste',
        precoBase: 100,
        tempoEstimadoMin: 25,
      },
    });
    servicoId = servico.id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  it('desistência em AGUARDANDO_PAGAMENTO não emite CancelarTarefa e termina CANCELADA', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await desistir.execute(os.id, { motivo: 'Desistência cliente' });
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_TAREFA)).toBe(0);
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      1,
    );
    await concluirCancelamentoPadrao(os.id, correlationId, 1);
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
    const reservas = await prisma.reservaEstoque.findMany({
      where: { ordemServicoId: os.id },
    });
    expect(
      reservas.every((r) => r.situacao === SituacaoReservaEstoque.LIBERADA),
    ).toBe(true);
  });

  it('desistência em RECEBIDA percorre compensação sem tarefa aberta', async () => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'Recebida',
      sugestoes: [],
    });
    await desistir.execute(os.id, { motivo: 'Antes do diagnóstico' });
    await simularRespostaExecucao(os.id, os.correlationId, 1, {
      tipoTarefa: 'DIAGNOSTICO',
      resultado: 'CANCELADA_SEM_EXISTIR',
    });
    if (
      (await contarOutbox(os.correlationId, COMANDO_CANCELAR_FINANCEIRO)) > 0
    ) {
      await simularRespostaFinanceiro(
        os.id,
        os.correlationId,
        1,
        'NADA_A_CANCELAR',
      );
    }
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
  });

  it('desistência em EM_EXECUCAO ordena Execution, Billing e estoque', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await desistir.execute(os.id, { motivo: 'Durante reparo' });
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_TAREFA)).toBe(1);
    await simularRespostaExecucao(os.id, correlationId, 1, {
      tipoTarefa: 'REPARO',
      resultado: 'CANCELADA_EM_ANDAMENTO',
    });
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      1,
    );
    const sequencia = await ordemOutbox(correlationId);
    expect(sequencia).toEqual([
      COMANDO_CANCELAR_TAREFA,
      COMANDO_CANCELAR_FINANCEIRO,
    ]);
    await simularRespostaFinanceiro(os.id, correlationId, 1, 'ESTORNADA');
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
  });

  it('não conclui CANCELADA com pendência financeira aberta', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await desistir.execute(os.id, { motivo: 'Pendência' });
    await simularRespostaFinanceiro(
      os.id,
      correlationId,
      1,
      'PENDENCIA_MANUAL_ABERTA',
    );
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.EM_CANCELAMENTO);
    expect(
      await prisma.pendenciaOs.count({
        where: {
          ordemServicoId: os.id,
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: false,
        },
      }),
    ).toBe(1);
  });

  it('reentrega do mesmo eventId não duplica comandos nem estoque', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await desistir.execute(os.id, { motivo: 'Idempotência' });
    const eventId = randomUUID();
    const corpo = montarEnvelope(
      EVENTO_RESPOSTA_CANCELAMENTO,
      os.id,
      correlationId,
      1,
      { resultado: 'NADA_A_CANCELAR' },
      eventId,
    );
    await Promise.all([processar.executar(corpo), processar.executar(corpo)]);
    expect(await prisma.mensagemProcessada.count({ where: { eventId } })).toBe(
      1,
    );
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_FINANCEIRO)).toBe(
      1,
    );
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
    expect(
      await prisma.pedidoEmitido.count({
        where: { ordemServicoId: os.id, tipo: 'CANCELAR_FINANCEIRO' },
      }),
    ).toBe(1);
  });

  it('ignora fato de rodada anterior sem efeito', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await desistir.execute(os.id, { motivo: 'Rodada' });
    const antes = await contarOutbox(correlationId, COMANDO_CANCELAR_TAREFA);
    await processar.executar(
      montarEnvelope(
        EVENTO_RESPOSTA_CANCELAMENTO_EXECUCAO,
        os.id,
        correlationId,
        0,
        {
          tipoTarefa: 'REPARO',
          resultado: 'CANCELADA_EM_ANDAMENTO',
        },
      ),
    );
    expect(await contarOutbox(correlationId, COMANDO_CANCELAR_TAREFA)).toBe(
      antes,
    );
  });

  it('pagamento confirmado durante EM_CANCELAMENTO atualiza projeção e avança compensação', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await desistir.execute(os.id, { motivo: 'Cancelando' });
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId: `ORD-TARDIO-${sufixo}`,
        valorCentavos: 20000,
      }),
    );
    expect(
      await prisma.projecaoFinanceiraOs.count({
        where: { ordemServicoId: os.id, orderId: `ORD-TARDIO-${sufixo}` },
      }),
    ).toBe(1);
    await concluirCancelamentoPadrao(os.id, correlationId, 1);
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
  });

  it('SituacaoFinanceira INDETERMINADA em E10 mantém EM_CANCELAMENTO e reserva ATIVA', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await desistir.execute(os.id, { motivo: 'E10 indeterminada' });
    await simularRespostaExecucao(os.id, correlationId, 1, {
      tipoTarefa: 'REPARO',
      resultado: 'JA_CONCLUIDA',
    });
    const consultaId = consultaIdExcecaoE10(os.id, 1);
    await processar.executar(
      montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
        consultaId,
        situacaoPagamento: 'INDETERMINADA',
        situacaoEstorno: 'NENHUM',
      }),
    );
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.EM_CANCELAMENTO);
    const ativa = await prisma.reservaEstoque.findFirst({
      where: {
        ordemServicoId: os.id,
        situacao: SituacaoReservaEstoque.ATIVA,
      },
    });
    expect(ativa).toBeTruthy();
  });

  it('consumo parcial na compensação libera o restante', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await desistir.execute(os.id, { motivo: 'Parcial' });
    await simularRespostaExecucao(os.id, correlationId, 1, {
      tipoTarefa: 'REPARO',
      resultado: 'CANCELADA_EM_ANDAMENTO',
      pecasUtilizadas: [{ itemId: pecaId, quantidade: 1 }],
    });
    await simularRespostaFinanceiro(os.id, correlationId, 1, 'ESTORNADA');
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
    const consumida = await prisma.reservaEstoque.findFirst({
      where: {
        ordemServicoId: os.id,
        pecaId,
        situacao: SituacaoReservaEstoque.CONSUMIDA,
      },
    });
    expect(consumida).toBeTruthy();
    const peca = await prisma.peca.findUnique({ where: { id: pecaId } });
    expect(peca?.quantidadeEstoque).toBeGreaterThanOrEqual(49);
  });

  it('cancelamento de uma OS preserva reservas ATIVA de outra OS', async () => {
    const a = await prepararAguardandoPagamento();
    const b = await prepararAguardandoPagamento();
    await desistir.execute(a.os.id, { motivo: 'Só A' });
    await concluirCancelamentoPadrao(a.os.id, a.correlationId, 1);
    const reservasB = await prisma.reservaEstoque.findMany({
      where: { ordemServicoId: b.os.id },
    });
    expect(
      reservasB.every((r) => r.situacao === SituacaoReservaEstoque.ATIVA),
    ).toBe(true);
  });

  it('exceção E10 FINALIZADA só com quatro condições satisfeitas (Billing autoritativo)', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await desistir.execute(os.id, { motivo: 'Concorrência reparo' });
    await simularRespostaExecucao(os.id, correlationId, 1, {
      tipoTarefa: 'REPARO',
      resultado: 'JA_CONCLUIDA',
    });
    expect(
      await contarOutbox(correlationId, COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
    ).toBe(1);
    const consultaId = consultaIdExcecaoE10(os.id, 1);
    await processar.executar(
      montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
        consultaId,
        situacaoPagamento: 'PAGO_NO_PRAZO',
        situacaoEstorno: 'NENHUM',
      }),
    );
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.FINALIZADA);
    const estado = await prisma.estadoCompensacaoOs.findUnique({
      where: { ordemServicoId: os.id },
    });
    expect(estado?.passo).toBe(PassoCompensacaoSaga.CONCLUIDO);
  });

  it('JA_CONCLUIDA de diagnóstico não ativa E10 nem FINALIZADA', async () => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'Diag',
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: 1 }],
    });
    const correlationId = os.correlationId;
    await processar.executar(
      montarEnvelope(EVENTO_DIAGNOSTICO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#DIAGNOSTICO`,
      }),
    );
    await desistir.execute(os.id, { motivo: 'Diag' });
    await simularRespostaExecucao(os.id, correlationId, 1, {
      tipoTarefa: 'DIAGNOSTICO',
      resultado: 'JA_CONCLUIDA',
    });
    expect(
      await contarOutbox(correlationId, COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
    ).toBe(0);
    await simularRespostaFinanceiro(os.id, correlationId, 1, 'ESTORNADA');
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
  });

  it('consultaId divergente não aplica SituacaoFinanceira da projeção local', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    await desistir.execute(os.id, { motivo: 'Consulta' });
    await simularRespostaExecucao(os.id, correlationId, 1, {
      tipoTarefa: 'REPARO',
      resultado: 'JA_CONCLUIDA',
    });
    await processar.executar(
      montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
        consultaId: 'consulta-invalida',
        situacaoPagamento: 'PAGO_NO_PRAZO',
        situacaoEstorno: 'NENHUM',
      }),
    );
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.EM_CANCELAMENTO);
  });

  it('CobrancaExpirada dispara compensação sem desistência manual', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await processar.executar(
      montarEnvelope(EVENTO_COBRANCA_EXPIRADA, os.id, correlationId, 1, {}),
    );
    expect(
      (await prisma.ordemServico.findUnique({ where: { id: os.id } }))?.status,
    ).toBe(StatusOS.EM_CANCELAMENTO);
    await concluirCancelamentoPadrao(os.id, correlationId, 1);
    expect(
      (await prisma.ordemServico.findUnique({ where: { id: os.id } }))?.status,
    ).toBe(StatusOS.CANCELADA);
  });

  it('atomicidade: mensagem processada, estado compensação e histórico coerentes', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    const eventId = randomUUID();
    await desistir.execute(os.id, { motivo: 'Atomicidade' });
    await processar.executar(
      montarEnvelope(
        EVENTO_RESPOSTA_CANCELAMENTO,
        os.id,
        correlationId,
        1,
        { resultado: 'NADA_A_CANCELAR' },
        eventId,
      ),
    );
    expect(await prisma.mensagemProcessada.count({ where: { eventId } })).toBe(
      1,
    );
    const estado = await prisma.estadoCompensacaoOs.findUnique({
      where: { ordemServicoId: os.id },
    });
    expect(estado?.passo).toBe(PassoCompensacaoSaga.CONCLUIDO);
    expect(
      await prisma.historicoStatusOS.count({
        where: { ordemServicoId: os.id, statusNovo: StatusOS.CANCELADA },
      }),
    ).toBe(1);
  });

  it('SEM_PAGAMENTO após consulta de prazo percorre compensação até CANCELADA', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await prisma.ordemServico.update({
      where: { id: os.id },
      data: { prazoReferenciaReserva: new Date(Date.now() - 60_000) },
    });
    await solicitarConsulta.execute(os.id);
    const consultaId = consultaIdPrazoReferencia(os.id, 1, 1);
    await processar.executar(
      montarEnvelope(EVENTO_SITUACAO_FINANCEIRA, os.id, correlationId, 1, {
        consultaId,
        situacaoPagamento: 'SEM_PAGAMENTO',
        situacaoEstorno: 'NENHUM',
      }),
    );
    await concluirCancelamentoPadrao(os.id, correlationId, 1);
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.CANCELADA);
    const reservas = await prisma.reservaEstoque.findMany({
      where: { ordemServicoId: os.id },
    });
    expect(
      reservas.every((r) => r.situacao === SituacaoReservaEstoque.LIBERADA),
    ).toBe(true);
  });

  it('PendenciaResolvida resolve somente a pendência financeira correspondente', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await desistir.execute(os.id, { motivo: 'Duas pendências' });
    const cobrancaA = randomUUID();
    const cobrancaB = randomUUID();
    await prisma.pendenciaOs.createMany({
      data: [
        {
          id: randomUUID(),
          ordemServicoId: os.id,
          rodada: 1,
          tipo: TipoPendenciaOs.FINANCEIRA,
          detalhes: { cobrancaId: cobrancaA, motivo: 'A' },
        },
        {
          id: randomUUID(),
          ordemServicoId: os.id,
          rodada: 1,
          tipo: TipoPendenciaOs.FINANCEIRA,
          detalhes: { cobrancaId: cobrancaB, motivo: 'B' },
        },
      ],
    });
    await processar.executar(
      montarEnvelope(EVENTO_PENDENCIA_RESOLVIDA, os.id, correlationId, 1, {
        cobrancaId: cobrancaA,
      }),
    );
    const abertas = await prisma.pendenciaOs.findMany({
      where: {
        ordemServicoId: os.id,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
      },
    });
    expect(abertas).toHaveLength(1);
    expect((abertas[0].detalhes as { cobrancaId: string }).cobrancaId).toBe(
      cobrancaB,
    );
  });

  it('retoma compensação após PendenciaResolvida em EM_CANCELAMENTO', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await desistir.execute(os.id, { motivo: 'Retomada pendência' });
    await processar.executar(
      montarEnvelope(EVENTO_RESPOSTA_CANCELAMENTO, os.id, correlationId, 1, {
        resultado: 'PENDENCIA_MANUAL_ABERTA',
        pendenciaId: `pend-${sufixo}`,
      }),
    );
    await processar.executar(
      montarEnvelope(EVENTO_PENDENCIA_RESOLVIDA, os.id, correlationId, 1, {
        pendenciaId: `pend-${sufixo}`,
      }),
    );
    await concluirCancelamentoPadrao(os.id, correlationId, 1);
    expect(
      (await prisma.ordemServico.findUnique({ where: { id: os.id } }))?.status,
    ).toBe(StatusOS.CANCELADA);
  });

  it('mesmo orderId com eventId diferente não duplica pendência financeira pós-encerramento', async () => {
    const { os, correlationId } = await prepararAguardandoPagamento();
    await desistir.execute(os.id, { motivo: 'Encerrada' });
    await concluirCancelamentoPadrao(os.id, correlationId, 1);
    const orderId = `ORD-DUP-${sufixo}`;
    const corpo = (eventId: string) =>
      montarEnvelope(
        EVENTO_PAGAMENTO_CONFIRMADO,
        os.id,
        correlationId,
        1,
        { orderId, valorCentavos: 1000 },
        eventId,
      );
    await processar.executar(corpo(randomUUID()));
    await processar.executar(corpo(randomUUID()));
    expect(
      await prisma.pendenciaOs.count({
        where: {
          ordemServicoId: os.id,
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: false,
        },
      }),
    ).toBe(1);
  });

  it('concorrência entre desistência e ReparoConcluido com transações independentes', async () => {
    const { os, correlationId } = await prepararEmExecucao();
    const resultados = await Promise.allSettled([
      desistir.execute(os.id, { motivo: 'Concorrência A' }),
      processar.executar(
        montarEnvelope(EVENTO_REPARO_CONCLUIDO, os.id, correlationId, 1, {
          pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
        }),
      ),
    ]);
    expect(resultados.some((r) => r.status === 'fulfilled')).toBe(true);
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect([
      StatusOS.EM_CANCELAMENTO,
      StatusOS.FINALIZADA,
      StatusOS.CANCELADA,
    ]).toContain(ordem?.status);
    expect(
      await prisma.estadoCompensacaoOs.findUnique({
        where: { ordemServicoId: os.id },
      }),
    ).toBeTruthy();
  });
});
