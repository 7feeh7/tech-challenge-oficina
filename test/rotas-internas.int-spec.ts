import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { EstadoIncompativelInternaError } from '@/modules/rotas-internas/domain/erros-internos';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  COMANDO_GERAR_ORCAMENTO,
  DESTINO_FILA_BILLING,
  EVENTO_STATUS_CHANGED,
} from '@/shared/messaging/envelope';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { StatusOS } from '@/shared/generated/prisma/enums';
import { UnitOfWork, UNIT_OF_WORK } from '@/shared/database/unit-of-work.port';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';
import { SessaoBloqueioOrdemServico } from './helpers/sessao-bloqueio-ordem-servico';

describe('Rotas internas de negócio (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let unitOfWork: UnitOfWork;
  let transicoes: TransicaoOrdemServicoService;
  let criarOs: CriarOrdemServicoUseCase;
  let concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  let reservar: ReservarOsInternoUseCase;

  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let pecaId: string;
  let servicoId: string;

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
        MensageriaModule,
        IdempotencyModule,
        PrismaModule,
        OrdensServicoModule,
        ReservasEstoqueModule,
        RotasInternasModule,
      ],
    }).compile();

    prisma = nestModule.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    unitOfWork = nestModule.get(UNIT_OF_WORK);
    transicoes = nestModule.get(TransicaoOrdemServicoService);
    criarOs = nestModule.get(CriarOrdemServicoUseCase);
    concluirDiagnostico = nestModule.get(ConcluirDiagnosticoInternoUseCase);
    reservar = nestModule.get(ReservarOsInternoUseCase);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '3'),
        email: `interno-${sufixo}@test.local`,
        telefone: '11999990000',
      },
    });
    clienteId = cliente.id;
    veiculoId = (
      await prisma.veiculo.create({
        data: {
          placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
          marca: 'Test',
          modelo: 'Modelo',
          ano: 2024,
          clienteId,
        },
      })
    ).id;
    pecaId = (
      await prisma.peca.create({
        data: {
          codigo: `INT-${sufixo}`,
          nome: 'Peça int',
          precoUnitario: 25,
          quantidadeEstoque: 50,
        },
      })
    ).id;
    servicoId = (
      await prisma.servico.create({
        data: {
          nome: `Srv ${sufixo}`,
          precoBase: 40,
          tempoEstimadoMin: 30,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule, prisma);
  });

  async function abrirOsEmDiagnostico(pecaDaOs: string = pecaId) {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'teste',
      pecas: [{ pecaId: pecaDaOs, quantidade: 1 }],
    });
    await unitOfWork.executar((contexto) =>
      transicoes.aplicar(contexto, {
        ordemServicoId: os.id,
        aplicar: (ordem, agora) => ordem.registrarDiagnosticoIniciado(agora),
        observacao: 'teste diagnostico',
      }),
    );
    return os.id;
  }

  it('conclui diagnóstico com idempotência e emite GerarOrcamento', async () => {
    const osId = await abrirOsEmDiagnostico();
    const key = `diagnostico:${randomUUID()}`;
    const entrada = {
      ordemServicoId: osId,
      rodada: 1,
      tarefaId: randomUUID(),
      laudo: 'Pastilhas gastas',
      itens: [
        { tipo: 'PECA' as const, itemId: pecaId, quantidade: 2 },
        { tipo: 'SERVICO' as const, itemId: servicoId, quantidade: 1 },
      ],
      idempotencyKey: key,
    };

    const primeiro = await concluirDiagnostico.execute(entrada);
    expect(primeiro.itensOficiais).toHaveLength(2);
    expect(primeiro.itensOficiais[0]?.nome).toBeTruthy();

    const segundo = await concluirDiagnostico.execute(entrada);
    expect(segundo).toEqual(primeiro);

    const osRegistro = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: osId },
      select: { correlationId: true },
    });
    const outbox = await prisma.outboxMensagem.findFirst({
      where: {
        eventType: COMANDO_GERAR_ORCAMENTO,
        correlationId: osRegistro.correlationId,
      },
    });
    expect(outbox?.destino).toBe(DESTINO_FILA_BILLING);

    const historico = await prisma.idempotencyRecord.count({
      where: { idempotencyKey: key, scope: 'internal.diagnostico' },
    });
    expect(historico).toBe(1);
  });

  // Mantém a OS bloqueada por uma conexão de fora do pool até as duas chamadas
  // estarem esperando o mesmo `FOR UPDATE`, para que a disputa seja real.
  async function executarDuasVezesEmDisputa<T>(
    ordemServicoId: string,
    operacao: () => Promise<T>,
  ): Promise<PromiseSettledResult<T>[]> {
    const sessao = new SessaoBloqueioOrdemServico(
      exigirDatabaseUrl(),
      ordemServicoId,
    );
    try {
      await sessao.adquirir();
      const chamadas = Promise.allSettled([operacao(), operacao()]);
      await sessao.aguardarDisputaBloqueio(2);
      await sessao.liberar();
      return await chamadas;
    } finally {
      await sessao.descartar();
    }
  }

  function contarOutbox(correlationId: string, eventType: string) {
    return prisma.outboxMensagem.count({ where: { correlationId, eventType } });
  }

  async function correlationIdDaOs(osId: string): Promise<string> {
    const os = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: osId },
      select: { correlationId: true },
    });
    return os.correlationId;
  }

  function valorDaChamada<T>(resultado: PromiseSettledResult<T>): T {
    if (resultado.status === 'rejected') {
      throw resultado.reason;
    }
    return resultado.value;
  }

  it('diagnóstico concorrente com a mesma chave devolve o mesmo corpo e grava um só efeito e uma só mensagem', async () => {
    const osId = await abrirOsEmDiagnostico();
    const correlationId = await correlationIdDaOs(osId);
    const key = `diagnostico:${randomUUID()}`;
    const body = {
      ordemServicoId: osId,
      rodada: 1,
      tarefaId: randomUUID(),
      laudo: 'Motor com ruído',
      itens: [
        { tipo: 'SERVICO' as const, itemId: servicoId, quantidade: 1 },
        { tipo: 'PECA' as const, itemId: pecaId, quantidade: 2 },
      ],
      idempotencyKey: key,
    };
    const historicoAntes = await prisma.historicoStatusOS.count({
      where: { ordemServicoId: osId },
    });
    const outboxAntes = await contarOutbox(
      correlationId,
      COMANDO_GERAR_ORCAMENTO,
    );

    const [primeira, segunda] = await executarDuasVezesEmDisputa(osId, () =>
      concluirDiagnostico.execute(body),
    );

    const corpoPrimeira = valorDaChamada(primeira);
    expect(valorDaChamada(segunda)).toEqual(corpoPrimeira);
    expect(corpoPrimeira.itensOficiais).toHaveLength(2);

    expect(
      await prisma.idempotencyRecord.count({
        where: { idempotencyKey: key, scope: 'internal.diagnostico' },
      }),
    ).toBe(1);
    expect(await contarOutbox(correlationId, COMANDO_GERAR_ORCAMENTO)).toBe(
      outboxAntes + 1,
    );
    expect(
      await prisma.ordemServicoServico.count({
        where: { ordemServicoId: osId },
      }),
    ).toBe(1);
    const pecasDaOs = await prisma.ordemServicoPeca.findMany({
      where: { ordemServicoId: osId },
    });
    expect(pecasDaOs).toHaveLength(1);
    expect(pecasDaOs[0].quantidade).toBe(2);
    expect(
      await prisma.historicoStatusOS.count({ where: { ordemServicoId: osId } }),
    ).toBe(historicoAntes);
  });

  it('reserva concorrente com a mesma chave devolve o mesmo corpo e grava uma só reserva, transição e mensagem', async () => {
    const pecaDaReserva = (
      await prisma.peca.create({
        data: {
          codigo: `RES-${sufixo}`,
          nome: 'Peça reserva concorrente',
          precoUnitario: 25,
          quantidadeEstoque: 10,
        },
      })
    ).id;
    const osId = await abrirOsEmDiagnostico(pecaDaReserva);
    const correlationId = await correlationIdDaOs(osId);
    await concluirDiagnostico.execute({
      ordemServicoId: osId,
      rodada: 1,
      tarefaId: randomUUID(),
      laudo: 'Laudo',
      itens: [{ tipo: 'PECA', itemId: pecaDaReserva, quantidade: 3 }],
      idempotencyKey: `diagnostico:${randomUUID()}`,
    });
    await unitOfWork.executar((contexto) =>
      transicoes.aplicar(contexto, {
        ordemServicoId: osId,
        aplicar: (ordem, agora) => ordem.registrarOrcamentoGerado(agora),
        observacao: 'orçamento',
      }),
    );
    const key = `reserva:${randomUUID()}:1`;
    const entrada = {
      ordemServicoId: osId,
      rodada: 1,
      orcamentoId: randomUUID(),
      idempotencyKey: key,
    };
    const historicoAntes = await prisma.historicoStatusOS.count({
      where: { ordemServicoId: osId },
    });
    const outboxAntes = await contarOutbox(
      correlationId,
      EVENTO_STATUS_CHANGED,
    );

    const [primeira, segunda] = await executarDuasVezesEmDisputa(osId, () =>
      reservar.execute(entrada),
    );

    expect(valorDaChamada(segunda)).toEqual(valorDaChamada(primeira));
    expect(
      await prisma.idempotencyRecord.count({
        where: { idempotencyKey: key, scope: 'internal.reserva' },
      }),
    ).toBe(1);
    const reservas = await prisma.reservaEstoque.findMany({
      where: { ordemServicoId: osId },
    });
    expect(reservas).toHaveLength(1);
    expect(reservas[0].quantidade).toBe(3);
    const peca = await prisma.peca.findUniqueOrThrow({
      where: { id: pecaDaReserva },
    });
    expect(peca.quantidadeReservada).toBe(3);
    const os = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: osId },
    });
    expect(os.status).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
    expect(
      await prisma.historicoStatusOS.count({ where: { ordemServicoId: osId } }),
    ).toBe(historicoAntes + 1);
    expect(await contarOutbox(correlationId, EVENTO_STATUS_CHANGED)).toBe(
      outboxAntes + 1,
    );
  });

  it('reserva e transiciona para AGUARDANDO_PAGAMENTO com prazo do banco', async () => {
    const osId = await abrirOsEmDiagnostico();
    const keyDiag = `diagnostico:${randomUUID()}`;
    await concluirDiagnostico.execute({
      ordemServicoId: osId,
      rodada: 1,
      tarefaId: randomUUID(),
      laudo: 'Laudo',
      itens: [{ tipo: 'PECA', itemId: pecaId, quantidade: 1 }],
      idempotencyKey: keyDiag,
    });

    await unitOfWork.executar((contexto) =>
      transicoes.aplicar(contexto, {
        ordemServicoId: osId,
        aplicar: (ordem, agora) => ordem.registrarOrcamentoGerado(agora),
        observacao: 'orçamento',
      }),
    );

    const keyReserva = `reserva:${randomUUID()}:1`;
    const saida = await reservar.execute({
      ordemServicoId: osId,
      rodada: 1,
      orcamentoId: randomUUID(),
      idempotencyKey: keyReserva,
    });

    expect(saida.reservaId).toBeTruthy();
    expect(new Date(saida.prazoReferencia).toString()).not.toBe('Invalid Date');

    const os = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: osId },
    });
    expect(os.status).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
  });

  it('ESTOQUE_INSUFICIENTE não grava idempotência', async () => {
    const osId = await abrirOsEmDiagnostico();
    await concluirDiagnostico.execute({
      ordemServicoId: osId,
      rodada: 1,
      tarefaId: randomUUID(),
      laudo: 'Laudo',
      itens: [{ tipo: 'PECA', itemId: pecaId, quantidade: 1 }],
      idempotencyKey: `diagnostico:${randomUUID()}`,
    });
    await unitOfWork.executar((contexto) =>
      transicoes.aplicar(contexto, {
        ordemServicoId: osId,
        aplicar: (ordem, agora) => ordem.registrarOrcamentoGerado(agora),
      }),
    );

    await prisma.peca.update({
      where: { id: pecaId },
      data: { quantidadeEstoque: 0, quantidadeReservada: 0 },
    });

    const key = `reserva:${randomUUID()}:1`;
    await expect(
      reservar.execute({
        ordemServicoId: osId,
        rodada: 1,
        orcamentoId: randomUUID(),
        idempotencyKey: key,
      }),
    ).rejects.toBeDefined();

    const gravado = await prisma.idempotencyRecord.count({
      where: { idempotencyKey: key, scope: 'internal.reserva' },
    });
    expect(gravado).toBe(0);

    await prisma.peca.update({
      where: { id: pecaId },
      data: { quantidadeEstoque: 50, quantidadeReservada: 0 },
    });
  });

  it('recusa reserva em status incompatível', async () => {
    const osId = await abrirOsEmDiagnostico();
    await expect(
      reservar.execute({
        ordemServicoId: osId,
        rodada: 1,
        orcamentoId: randomUUID(),
        idempotencyKey: `reserva:${randomUUID()}:1`,
      }),
    ).rejects.toBeInstanceOf(EstadoIncompativelInternaError);
  });
});
