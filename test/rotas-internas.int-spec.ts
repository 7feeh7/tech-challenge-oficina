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

  async function abrirOsEmDiagnostico() {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'teste',
      pecas: [{ pecaId, quantidade: 1 }],
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

  it('idempotência concorrente com a mesma chave grava um único efeito', async () => {
    const osId = await abrirOsEmDiagnostico();
    const key = `diagnostico:${randomUUID()}`;
    const body = {
      ordemServicoId: osId,
      rodada: 1,
      tarefaId: randomUUID(),
      laudo: 'Motor com ruído',
      itens: [{ tipo: 'SERVICO' as const, itemId: servicoId, quantidade: 1 }],
      idempotencyKey: key,
    };

    const resultados = await Promise.allSettled([
      concluirDiagnostico.execute(body),
      concluirDiagnostico.execute(body),
    ]);
    const sucesso = resultados.filter((r) => r.status === 'fulfilled');
    expect(sucesso.length).toBeGreaterThanOrEqual(1);
    const gravados = await prisma.idempotencyRecord.count({
      where: { idempotencyKey: key, scope: 'internal.diagnostico' },
    });
    expect(gravados).toBe(1);
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
