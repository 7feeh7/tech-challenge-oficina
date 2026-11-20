import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { ResolverConsumoManualUseCase } from '@/modules/reservas-estoque/application/use-cases/resolver-consumo-manual.use-case';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  EVENTO_REPARO_FALHOU,
} from '@/shared/messaging/envelope';
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
import { contarPendenciaNatureza } from './helpers/e42-envelope';

function montarFatoFalhou(
  osId: string,
  correlationId: string,
  pecas: { itemId: string; quantidade: number }[],
  eventId = randomUUID(),
  occurredAt = '2026-06-15T14:00:00.000Z',
) {
  return JSON.stringify({
    eventId,
    eventType: EVENTO_REPARO_FALHOU,
    version: 1,
    occurredAt,
    source: 'teste-fato-tardio',
    correlationId,
    causationId: null,
    ordemServicoId: osId,
    rodada: 1,
    payload: {
      pecasUtilizadas: pecas,
      falhouEm: '2026-06-15T14:00:00.000Z',
      motivo: 'falha tardia',
    },
  });
}

describe('Fato tardio após resolução manual (integração E42)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let reservar: ReservarEstoqueUseCase;
  let resolver: ResolverConsumoManualUseCase;
  let processar: ProcessarMensagemEntradaService;

  async function criarOsComReserva(qtdReserva: number, estoqueFisico = 40) {
    const peca = await prisma.peca.create({
      data: {
        codigo: `FT-${randomUUID().slice(0, 8)}`,
        nome: 'Peça fato tardio',
        precoUnitario: 9,
        quantidadeEstoque: estoqueFisico,
      },
    });
    const cliente = await prisma.cliente.create({
      data: {
        nome: 'Cliente FT',
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '3'),
        email: `ft-${randomUUID()}@test.local`,
        telefone: '11955554444',
      },
    });
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId: cliente.id,
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
        marca: 'M',
        modelo: 'M',
        ano: 2022,
      },
    });
    const os = await prisma.ordemServico.create({
      data: {
        correlationId: randomUUID(),
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        status: StatusOS.EM_CANCELAMENTO,
      },
    });
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: qtdReserva }],
    });
    const qtdOriginal = (
      await prisma.reservaEstoque.findFirstOrThrow({
        where: { ordemServicoId: os.id, pecaId: peca.id },
      })
    ).quantidade;
    const pendencia = await prisma.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: os.id,
        rodada: 1,
        tipo: TipoPendenciaOs.INVENTARIO,
        detalhes: { natureza: 'INFORMACAO_INSUFICIENTE', conteudo: {} },
      },
    });
    return { os, peca, pendencia, qtdOriginal };
  }

  async function resolverManual(
    pendenciaId: string,
    pecaId: string,
    consumido: number,
    liberado: number,
  ) {
    await resolver.execute({
      pendenciaId,
      itensConsumidos: consumido ? [{ pecaId, quantidade: consumido }] : [],
      itensLiberados: liberado ? [{ pecaId, quantidade: liberado }] : [],
      motivo: 'resolução pré fato tardio',
      responsavelId: randomUUID(),
      idempotencyKey: `resolucao:ft:${pendenciaId}`,
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
    resolver = nestModule.get(ResolverConsumoManualUseCase);
    processar = nestModule.get(ProcessarMensagemEntradaService);
  });

  afterAll(async () => fecharModuloIntegracao(nestModule));

  it('fato compatível com reserva CONSUMIDA grava fato_tardio_* sem nova baixa', async () => {
    const { os, peca, pendencia, qtdOriginal } = await criarOsComReserva(4);
    await resolverManual(pendencia.id, peca.id, 2, 2);
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe(SituacaoReservaEstoque.CONSUMIDA);
    expect(reserva.quantidade).toBe(qtdOriginal);
    const fatoId = randomUUID();
    await processar.executar(
      montarFatoFalhou(
        os.id,
        os.correlationId,
        [{ itemId: peca.id, quantidade: 2 }],
        fatoId,
      ),
    );
    const resolucao = await prisma.resolucaoConsumoManual.findUniqueOrThrow({
      where: {
        ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 },
      },
    });
    expect(resolucao.fatoTardioEventId).toBe(fatoId);
    expect(resolucao.fatoTardioConteudo).toBeTruthy();
    const fisicoDepois = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    expect(fisicoDepois).toBe(fisicoAntes);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(0);
    await processar.executar(
      montarFatoFalhou(
        os.id,
        os.correlationId,
        [{ itemId: peca.id, quantidade: 2 }],
        fatoId,
      ),
    );
    const resolucaoReentrega =
      await prisma.resolucaoConsumoManual.findUniqueOrThrow({
        where: { id: resolucao.id },
      });
    expect(resolucaoReentrega.fatoTardioEventId).toBe(fatoId);
  });

  it('fato compatível com reserva LIBERADA e consumo zero', async () => {
    const { os, peca, pendencia } = await criarOsComReserva(3);
    await resolverManual(pendencia.id, peca.id, 0, 3);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe(SituacaoReservaEstoque.LIBERADA);
    await processar.executar(
      montarFatoFalhou(os.id, os.correlationId, [], randomUUID()),
    );
    expect(
      await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
    ).toBe(0);
  });

  it('consolida peças repetidas no fato compatível', async () => {
    const { os, peca, pendencia } = await criarOsComReserva(4);
    await resolverManual(pendencia.id, peca.id, 3, 1);
    await processar.executar(
      montarFatoFalhou(os.id, os.correlationId, [
        { itemId: peca.id, quantidade: 1 },
        { itemId: peca.id, quantidade: 2 },
      ]),
    );
    const resolucao = await prisma.resolucaoConsumoManual.findUniqueOrThrow({
      where: {
        ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 },
      },
    });
    expect(resolucao.fatoTardioEventId).toBeTruthy();
  });

  it('fato incompatível por quantidade abre CONFLITO_CONSUMO idempotente', async () => {
    const { os, peca, pendencia } = await criarOsComReserva(4);
    await resolverManual(pendencia.id, peca.id, 2, 2);
    await processar.executar(
      montarFatoFalhou(os.id, os.correlationId, [
        { itemId: peca.id, quantidade: 3 },
      ]),
    );
    expect(
      await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
    ).toBe(1);
    const fisico = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    await processar.executar(
      montarFatoFalhou(
        os.id,
        os.correlationId,
        [{ itemId: peca.id, quantidade: 3 }],
        randomUUID(),
      ),
    );
    expect(
      await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
    ).toBe(1);
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } }))
        .quantidadeEstoque,
    ).toBe(fisico);
    expect(
      await prisma.outboxMensagem.count({
        where: {
          correlationId: os.correlationId,
          eventType: COMANDO_CANCELAR_FINANCEIRO,
        },
      }),
    ).toBeLessThanOrEqual(1);
    const ordem = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: os.id },
    });
    expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
  });

  it('consumo acima da reserva original e peça fora da reserva', async () => {
    const { os, peca, pendencia } = await criarOsComReserva(2);
    await resolverManual(pendencia.id, peca.id, 1, 1);
    await processar.executar(
      montarFatoFalhou(os.id, os.correlationId, [
        { itemId: peca.id, quantidade: 4 },
      ]),
    );
    expect(
      await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
    ).toBeGreaterThanOrEqual(1);

    const {
      os: os2,
      peca: pecaA,
      pendencia: pend2,
    } = await criarOsComReserva(2);
    const pecaB = await prisma.peca.create({
      data: {
        codigo: `FTB-${randomUUID().slice(0, 6)}`,
        nome: 'Outra',
        precoUnitario: 5,
        quantidadeEstoque: 10,
      },
    });
    await resolverManual(pend2.id, pecaA.id, 1, 1);
    await processar.executar(
      montarFatoFalhou(os2.id, os2.correlationId, [
        { itemId: pecaB.id, quantidade: 1 },
      ]),
    );
    expect(
      await contarPendenciaNatureza(prisma, os2.id, 'CONFLITO_CONSUMO'),
    ).toBe(1);
  });

  it('sem reserva original não presume compatibilidade', async () => {
    const cliente = await prisma.cliente.create({
      data: {
        nome: 'Sem reserva',
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '0'),
        email: `sr-${randomUUID()}@test.local`,
        telefone: '11944443333',
      },
    });
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId: cliente.id,
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
        marca: 'M',
        modelo: 'M',
        ano: 2020,
      },
    });
    const os = await prisma.ordemServico.create({
      data: {
        correlationId: randomUUID(),
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        status: StatusOS.EM_CANCELAMENTO,
      },
    });
    const peca = await prisma.peca.create({
      data: {
        codigo: `SR-${randomUUID().slice(0, 6)}`,
        nome: 'Órfã',
        precoUnitario: 1,
        quantidadeEstoque: 5,
      },
    });
    const pendencia = await prisma.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: os.id,
        rodada: 1,
        tipo: TipoPendenciaOs.INVENTARIO,
        detalhes: { natureza: 'INFORMACAO_INSUFICIENTE', conteudo: {} },
      },
    });
    await resolverManual(pendencia.id, peca.id, 0, 0);
    await processar.executar(
      montarFatoFalhou(os.id, os.correlationId, [
        { itemId: peca.id, quantidade: 0 },
      ]),
    );
    expect(
      await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
    ).toBe(1);
  });

  it('peça desconhecida e identificador inválido', async () => {
    const { os, peca, pendencia } = await criarOsComReserva(2);
    await resolverManual(pendencia.id, peca.id, 1, 1);
    const desconhecida = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await processar.executar(
      montarFatoFalhou(os.id, os.correlationId, [
        { itemId: desconhecida, quantidade: 1 },
      ]),
    );
    expect(
      await contarPendenciaNatureza(prisma, os.id, 'CONFLITO_CONSUMO'),
    ).toBe(1);

    const {
      os: os3,
      peca: peca3,
      pendencia: pend3,
    } = await criarOsComReserva(2);
    await resolverManual(pend3.id, peca3.id, 1, 1);
    await processar.executar(
      montarFatoFalhou(os3.id, os3.correlationId, [
        { itemId: 'nao-uuid', quantidade: 1 },
      ]),
    );
    expect(
      await contarPendenciaNatureza(prisma, os3.id, 'CONFLITO_CONSUMO'),
    ).toBe(1);
  });
});
