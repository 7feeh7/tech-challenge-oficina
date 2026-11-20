import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ReservasEstoqueModule } from '../src/modules/reservas-estoque/reservas-estoque.module';
import { RESERVA_ESTOQUE_GATEWAY } from '../src/modules/reservas-estoque/application/ports/tokens';
import type { ReservaEstoqueGateway } from '../src/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { PrismaUnitOfWork } from '../src/shared/database/prisma-unit-of-work';
import { UNIT_OF_WORK } from '../src/shared/database/unit-of-work.port';
import { ConsumirReservaEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import { TipoDivergenciaConsumo } from '../src/modules/reservas-estoque/domain/tipo-divergencia-consumo';
import { ReservarEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('Reconciliação do consumo efetivo (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let reservar: ReservarEstoqueUseCase;
  let consumir: ConsumirReservaEstoqueUseCase;
  let reservas: ReservaEstoqueGateway;
  let unitOfWork: PrismaUnitOfWork;

  beforeAll(async () => {
    exigirDatabaseUrl();
    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        ReservasEstoqueModule,
      ],
    }).compile();
    prisma = nestModule.get(PrismaService);
    reservar = nestModule.get(ReservarEstoqueUseCase);
    consumir = nestModule.get(ConsumirReservaEstoqueUseCase);
    reservas = nestModule.get(RESERVA_ESTOQUE_GATEWAY);
    unitOfWork = nestModule.get(UNIT_OF_WORK);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  async function criarPeca(estoque: number) {
    return prisma.peca.create({
      data: {
        codigo: `REC-${randomUUID().slice(0, 8)}`,
        nome: 'Peça reconciliação',
        precoUnitario: 10,
        quantidadeEstoque: estoque,
      },
    });
  }

  async function criarOs() {
    const cliente = await prisma.cliente.create({
      data: {
        nome: 'Cliente teste',
        email: `c-${randomUUID()}@test.com`,
        telefone: '11999999999',
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '9'),
      },
    });
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId: cliente.id,
        marca: 'Marca',
        modelo: 'Modelo',
        ano: 2020,
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
      },
    });
    return prisma.ordemServico.create({
      data: {
        correlationId: randomUUID(),
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        status: 'EM_EXECUCAO',
      },
    });
  }

  it('consumo inferior não abre pendência INVENTARIO', async () => {
    const peca = await criarPeca(20);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });
    const eventId = randomUUID();
    const out = await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 1 }],
      idempotencyKey: `estoque.consumir:${eventId}`,
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date(),
        tipoFato: 'REPARO_CONCLUIDO',
        divergenciasFato: [
          {
            pecaId: peca.id,
            quantidadeReservada: 4,
            quantidadeInformada: 1,
            quantidadePrevista: 4,
            quantidadeUtilizada: 1,
            tipo: TipoDivergenciaConsumo.CONSUMO_INFERIOR,
            motivo: 'inferior',
          },
        ],
        consumoEfetivo: [{ itemId: peca.id, quantidade: 1 }],
      },
    });
    expect(out.impedimentoInventario).toBe(false);
    expect(out.pendenciaInventarioId).toBeNull();
    const registro = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(registro.situacaoReconciliacao).toBe('APLICADO');
  });

  it('reentrega do mesmo eventId não duplica consumo', async () => {
    const peca = await criarPeca(20);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const eventId = randomUUID();
    const base = {
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 2 }],
      idempotencyKey: `estoque.consumir:${eventId}`,
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date(),
        tipoFato: 'REPARO_CONCLUIDO' as const,
        consumoEfetivo: [{ itemId: peca.id, quantidade: 2 }],
      },
    };
    await consumir.execute(base);
    const segundo = await consumir.execute(base);
    expect(segundo.reutilizado).toBe(true);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
  });

  it('excesso gera pendência única e não baixa estoque livre além da reserva', async () => {
    const peca = await criarPeca(15);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 3 }],
    });
    const antes = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    const eventId = randomUUID();
    const out = await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 8 }],
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date(),
        tipoFato: 'REPARO_CONCLUIDO',
        consumoEfetivo: [{ itemId: peca.id, quantidade: 8 }],
      },
    });
    expect(out.impedimentoInventario).toBe(true);
    const depois = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(depois.quantidadeEstoque).toBe(antes.quantidadeEstoque - 3);
    expect(
      await prisma.pendenciaOs.count({
        where: { ordemServicoId: os.id, tipo: 'INVENTARIO', resolvida: false },
      }),
    ).toBe(1);
  });

  it('CONSUMO_ZERO libera reserva sem pendência', async () => {
    const peca = await criarPeca(12);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 3 }],
    });
    const eventId = randomUUID();
    const out = await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [],
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date('2025-01-10T10:00:00Z'),
        tipoFato: 'REPARO_CONCLUIDO',
        divergenciasFato: [
          {
            pecaId: peca.id,
            quantidadeReservada: 3,
            quantidadeInformada: 0,
            quantidadePrevista: 3,
            quantidadeUtilizada: 0,
            tipo: TipoDivergenciaConsumo.CONSUMO_ZERO,
            motivo: 'zero',
          },
        ],
        consumoEfetivo: [],
      },
    });
    expect(out.impedimentoInventario).toBe(false);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe('LIBERADA');
  });

  it('consumo exclusivo fora da reserva registra consumo sem reserva CONSUMIDA', async () => {
    const reservada = await criarPeca(20);
    const fora = await criarPeca(20);
    const os = await criarOs();
    const osOutra = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: reservada.id, quantidade: 2 }],
    });
    await reservar.execute({
      ordemServicoId: osOutra.id,
      rodada: 1,
      itens: [{ pecaId: reservada.id, quantidade: 3 }],
    });
    const eventId = randomUUID();
    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: fora.id, quantidade: 2 }],
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date(),
        tipoFato: 'REPARO_CONCLUIDO',
        divergenciasFato: [
          {
            pecaId: fora.id,
            tipo: TipoDivergenciaConsumo.FORA_DA_LISTA,
            quantidadePrevista: 0,
            quantidadeUtilizada: 2,
            quantidadeReservada: 0,
            quantidadeInformada: 2,
            justificativa: 'necessário no reparo',
            motivo: 'fora',
          },
        ],
        consumoEfetivo: [{ itemId: fora.id, quantidade: 2 }],
      },
    });
    expect(
      await prisma.reservaEstoque.count({
        where: {
          ordemServicoId: os.id,
          situacao: 'CONSUMIDA',
        },
      }),
    ).toBe(0);
    const registro = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    const efetivo = registro.consumoEfetivo as { itemId: string }[];
    expect(efetivo).toEqual(
      expect.arrayContaining([{ itemId: fora.id, quantidade: 2 }]),
    );
    await unitOfWork.executar(async (ctx) => {
      expect(await reservas.possuiConsumoAplicadoNaRodada(ctx, os.id, 1)).toBe(
        true,
      );
    });
    const reservaOutra = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: osOutra.id, pecaId: reservada.id },
    });
    expect(reservaOutra.situacao).toBe('ATIVA');
    expect(reservaOutra.quantidade).toBe(3);
    const estoqueForaDepois = await prisma.peca.findUniqueOrThrow({
      where: { id: fora.id },
    });
    expect(estoqueForaDepois.quantidadeEstoque).toBe(20);
  });

  it('peça no catálogo sem reserva na OS gera pendência sem baixar estoque', async () => {
    const reservada = await criarPeca(20);
    const semReserva = await criarPeca(15);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: reservada.id, quantidade: 2 }],
    });
    const estoqueSemReservaAntes = await prisma.peca.findUniqueOrThrow({
      where: { id: semReserva.id },
    });
    const eventId = randomUUID();
    const out = await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [
        { pecaId: reservada.id, quantidade: 2 },
        { pecaId: semReserva.id, quantidade: 1 },
      ],
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date(),
        tipoFato: 'REPARO_CONCLUIDO',
        consumoEfetivo: [
          { itemId: reservada.id, quantidade: 2 },
          { itemId: semReserva.id, quantidade: 1 },
        ],
      },
    });
    expect(out.impedimentoInventario).toBe(true);
    const estoqueSemReservaDepois = await prisma.peca.findUniqueOrThrow({
      where: { id: semReserva.id },
    });
    expect(estoqueSemReservaDepois.quantidadeEstoque).toBe(
      estoqueSemReservaAntes.quantidadeEstoque,
    );
    const registro = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    const efetivo = registro.consumoEfetivo as { itemId: string }[];
    expect(
      efetivo.some((i) => i.itemId === semReserva.id && i.quantidade === 1),
    ).toBe(true);
  });

  it('UUID válido sem peça no catálogo vira divergência sem erro PostgreSQL', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const desconhecida = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const eventId = randomUUID();
    const out = await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: desconhecida, quantidade: 1 }],
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date(),
        tipoFato: 'REPARO_CONCLUIDO',
        consumoEfetivo: [{ itemId: desconhecida, quantidade: 1 }],
      },
    });
    expect(out.impedimentoInventario).toBe(true);
    const registro = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    const divs = registro.divergencias as { pecaId: string }[];
    expect(divs.some((d) => d.pecaId === desconhecida)).toBe(true);
  });

  it('itemId inválido não provoca erro de conversão UUID', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    await expect(
      consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: 'nao-uuid', quantidade: 1 }],
        contextoFato: {
          eventId: randomUUID(),
          fatoOcorridoEm: new Date(),
          tipoFato: 'REPARO_CONCLUIDO',
          consumoEfetivo: [{ itemId: 'nao-uuid', quantidade: 1 }],
        },
      }),
    ).resolves.toMatchObject({ impedimentoInventario: true });
  });

  it('mensagem legada sem campos aditivos não inventa auditoria', async () => {
    const peca = await criarPeca(10);
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
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date('2025-02-01T08:00:00Z'),
        tipoFato: 'REPARO_CONCLUIDO',
        consumoEfetivo: [{ itemId: peca.id, quantidade: 2 }],
      },
    });
    const registro = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(registro.responsavelId).toBeNull();
    const divs = registro.divergencias as { tipo?: string }[];
    expect(divs.every((d) => d.tipo == null || d.tipo === undefined)).toBe(
      true,
    );
    const pend = await prisma.pendenciaOs.findFirst({
      where: { ordemServicoId: os.id, tipo: 'INVENTARIO' },
    });
    expect(pend).toBeNull();
  });

  it('persiste auditoria completa com justificativa de 500 caracteres', async () => {
    const peca = await criarPeca(20);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const justificativa = 'J'.repeat(500);
    const fatoEm = new Date('2025-03-05T16:45:00Z');
    const eventId = randomUUID();
    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 7 }],
      contextoFato: {
        eventId,
        fatoOcorridoEm: fatoEm,
        responsavelId: 'sub|legado',
        tipoFato: 'REPARO_CONCLUIDO',
        divergenciasFato: [
          {
            pecaId: peca.id,
            tipo: TipoDivergenciaConsumo.CONSUMO_ACIMA,
            quantidadePrevista: 2,
            quantidadeUtilizada: 7,
            quantidadeReservada: 2,
            quantidadeInformada: 7,
            justificativa,
            motivo: 'acima',
          },
        ],
        consumoEfetivo: [{ itemId: peca.id, quantidade: 7 }],
      },
    });
    const pend = await prisma.pendenciaOs.findFirstOrThrow({
      where: { ordemServicoId: os.id, tipo: 'INVENTARIO' },
    });
    const detalhes = pend.detalhes as {
      responsavelId?: string;
      fatoOcorridoEm?: string;
      divergenciasAuditoria?: { justificativa?: string; tipo?: string }[];
    };
    expect(detalhes.responsavelId).toBe('sub|legado');
    expect(detalhes.divergenciasAuditoria?.[0]?.justificativa).toBe(
      justificativa,
    );
    expect(detalhes.divergenciasAuditoria?.[0]?.tipo).toBe(
      TipoDivergenciaConsumo.CONSUMO_ACIMA,
    );
  });

  it('rollback remove consumo aplicado quando transação externa aborta', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    await expect(
      unitOfWork.executar(async (ctx) => {
        await consumir.execute(
          {
            ordemServicoId: os.id,
            rodada: 1,
            itensUtilizados: [{ pecaId: peca.id, quantidade: 2 }],
            contextoFato: {
              eventId: randomUUID(),
              fatoOcorridoEm: new Date(),
              tipoFato: 'REPARO_CONCLUIDO',
              consumoEfetivo: [{ itemId: peca.id, quantidade: 2 }],
            },
          },
          ctx,
        );
        throw new Error('abortar-transacao');
      }),
    ).rejects.toThrow('abortar-transacao');
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(0);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe('ATIVA');
  });

  it('persiste responsavelId textual não UUID', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 1 }],
    });
    const eventId = randomUUID();
    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 2 }],
      contextoFato: {
        eventId,
        fatoOcorridoEm: new Date(),
        responsavelId: 'auth0|mecanico-xyz',
        tipoFato: 'REPARO_CONCLUIDO',
        consumoEfetivo: [{ itemId: peca.id, quantidade: 2 }],
      },
    });
    const registro = await prisma.consumoAplicadoOs.findUniqueOrThrow({
      where: { ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 } },
    });
    expect(registro.responsavelId).toBe('auth0|mecanico-xyz');
  });
});
