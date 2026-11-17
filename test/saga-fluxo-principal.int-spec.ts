import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { LiberarReservaEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/liberar-reserva-estoque.use-case';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  COMANDO_INICIAR_REPARO,
  DESTINO_FILA_EXECUTION,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_INICIADO,
} from '@/shared/messaging/envelope';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { StatusOS } from '@/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('Saga — fluxo principal (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let criarOs: CriarOrdemServicoUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;
  let processar: ProcessarMensagemEntradaService;
  let liberarReserva: LiberarReservaEstoqueUseCase;

  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let pecaId: string;
  let servicoId: string;

  const montarEnvelopeObj = (
    eventType: string,
    ordemServicoId: string,
    correlationId: string,
    rodada: number,
    payload: Record<string, unknown>,
    eventId = randomUUID(),
  ) => ({
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

  const montarEnvelope = (
    eventType: string,
    ordemServicoId: string,
    correlationId: string,
    rodada: number,
    payload: Record<string, unknown>,
    eventId?: string,
  ) =>
    JSON.stringify(
      montarEnvelopeObj(
        eventType,
        ordemServicoId,
        correlationId,
        rodada,
        payload,
        eventId,
      ),
    );

  const prepararOsAguardandoPagamento = async () => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'Teste saga',
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: 2 }],
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
      laudo: 'Laudo saga',
      itens: [
        { tipo: 'SERVICO', itemId: servicoId, quantidade: 1 },
        { tipo: 'PECA', itemId: pecaId, quantidade: 2 },
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
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);
    processar = nestModule.get(ProcessarMensagemEntradaService);
    liberarReserva = nestModule.get(LiberarReservaEstoqueUseCase);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente saga ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '7'),
        email: `saga-${sufixo}@test.local`,
        telefone: '11988887777',
      },
    });
    clienteId = cliente.id;
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId,
        placa: `SG${sufixo.slice(0, 5).toUpperCase()}`
          .padEnd(7, '1')
          .slice(0, 7),
        modelo: 'Teste',
        marca: 'Marca',
        ano: 2020,
      },
    });
    veiculoId = veiculo.id;
    const peca = await prisma.peca.create({
      data: {
        codigo: `P-SAGA-${sufixo}`,
        nome: 'Peça saga',
        precoUnitario: 50,
        quantidadeEstoque: 20,
      },
    });
    pecaId = peca.id;
    const servico = await prisma.servico.create({
      data: {
        nome: `Serviço saga ${sufixo}`,
        descricao: 'Teste',
        precoBase: 120,
        tempoEstimadoMin: 30,
      },
    });
    servicoId = servico.id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  it('percorre RECEBIDA até FINALIZADA sem orçamento legado', async () => {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'Teste saga',
      sugestoes: [{ tipo: 'PECA', itemId: pecaId, quantidade: 2 }],
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
      laudo: 'Laudo saga',
      itens: [
        { tipo: 'SERVICO', itemId: servicoId, quantidade: 1 },
        { tipo: 'PECA', itemId: pecaId, quantidade: 2 },
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

    const orderId = `ORD-SAGA-${sufixo}`;
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId,
        valorCentavos: 20000,
      }),
    );

    await processar.executar(
      montarEnvelope(EVENTO_REPARO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#REPARO`,
      }),
    );

    const reparoConcluido = montarEnvelope(
      EVENTO_REPARO_CONCLUIDO,
      os.id,
      correlationId,
      1,
      {
        pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }],
        divergencias: [],
      },
    );
    await processar.executar(reparoConcluido);
    await processar.executar(reparoConcluido);

    const final = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(final?.status).toBe(StatusOS.FINALIZADA);

    const outboxReparo = await prisma.outboxMensagem.findFirst({
      where: {
        correlationId,
        eventType: COMANDO_INICIAR_REPARO,
        destino: DESTINO_FILA_EXECUTION,
      },
    });
    expect(outboxReparo).toBeTruthy();
  });

  it('não avança para execução antes do pagamento confirmado', async () => {
    const { os, correlationId } = await prepararOsAguardandoPagamento();
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#REPARO`,
      }),
    );
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
    expect(
      await prisma.outboxMensagem.count({
        where: { eventType: COMANDO_INICIAR_REPARO, correlationId },
      }),
    ).toBe(0);
  });

  it('reentrega concorrente do mesmo eventId não duplica efeito nem comandos', async () => {
    const { os, correlationId } = await prepararOsAguardandoPagamento();
    const eventId = randomUUID();
    const orderId = `ORD-CONC-${sufixo}`;
    const corpo = montarEnvelope(
      EVENTO_PAGAMENTO_CONFIRMADO,
      os.id,
      correlationId,
      1,
      { cobrancaId: randomUUID(), orderId, valorCentavos: 20000 },
      eventId,
    );
    await Promise.all([processar.executar(corpo), processar.executar(corpo)]);
    expect(await prisma.mensagemProcessada.count({ where: { eventId } })).toBe(
      1,
    );
    expect(
      await prisma.outboxMensagem.count({
        where: { eventType: COMANDO_INICIAR_REPARO, correlationId },
      }),
    ).toBe(1);
    expect(
      await prisma.historicoStatusOS.count({
        where: {
          ordemServicoId: os.id,
          statusNovo: StatusOS.AGUARDANDO_EXECUCAO,
        },
      }),
    ).toBe(1);
  });

  it('mesmo orderId em eventId diferente concilia sem novo IniciarReparo', async () => {
    const { os, correlationId } = await prepararOsAguardandoPagamento();
    const orderId = `ORD-DUP-${sufixo}`;
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId,
        valorCentavos: 20000,
      }),
    );
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId,
        valorCentavos: 20000,
      }),
    );
    expect(
      await prisma.outboxMensagem.count({
        where: { eventType: COMANDO_INICIAR_REPARO, correlationId },
      }),
    ).toBe(1);
    expect(
      await prisma.projecaoFinanceiraOs.count({
        where: { ordemServicoId: os.id, orderId },
      }),
    ).toBe(1);
  });

  it('preserva correlationId da OS e causationId do status-changed no IniciarReparo', async () => {
    const { os, correlationId } = await prepararOsAguardandoPagamento();
    const orderId = `ORD-CAUS-${sufixo}`;
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId,
        valorCentavos: 20000,
      }),
    );
    const outbox = await prisma.outboxMensagem.findFirst({
      where: {
        correlationId,
        eventType: COMANDO_INICIAR_REPARO,
      },
    });
    const historico = await prisma.historicoStatusOS.findFirst({
      where: {
        ordemServicoId: os.id,
        statusNovo: StatusOS.AGUARDANDO_EXECUCAO,
      },
      orderBy: { ocorridoEm: 'desc' },
    });
    expect(outbox?.correlationId).toBe(correlationId);
    const envelope = outbox?.envelope as {
      correlationId?: string;
      causationId?: string;
    };
    expect(envelope.correlationId).toBe(correlationId);
    expect(envelope.causationId).toBe(historico?.eventId);
  });

  it('rollback não marca mensagem processada quando reserva só LIBERADA', async () => {
    const { os, correlationId } = await prepararOsAguardandoPagamento();
    const orderId = `ORD-LIB-${sufixo}`;
    await processar.executar(
      montarEnvelope(EVENTO_PAGAMENTO_CONFIRMADO, os.id, correlationId, 1, {
        cobrancaId: randomUUID(),
        orderId,
        valorCentavos: 20000,
      }),
    );
    await processar.executar(
      montarEnvelope(EVENTO_REPARO_INICIADO, os.id, correlationId, 1, {
        tarefaId: `${os.id}#1#REPARO`,
      }),
    );
    await liberarReserva.execute({
      ordemServicoId: os.id,
      rodada: 1,
      idempotencyKey: `liberar:${sufixo}`,
    });
    const eventId = randomUUID();
    const corpo = montarEnvelope(
      EVENTO_REPARO_CONCLUIDO,
      os.id,
      correlationId,
      1,
      { pecasUtilizadas: [{ itemId: pecaId, quantidade: 2 }] },
      eventId,
    );
    await expect(processar.executar(corpo)).rejects.toThrow();
    expect(await prisma.mensagemProcessada.count({ where: { eventId } })).toBe(
      0,
    );
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: os.id },
    });
    expect(ordem?.status).toBe(StatusOS.EM_EXECUCAO);
  });
});
