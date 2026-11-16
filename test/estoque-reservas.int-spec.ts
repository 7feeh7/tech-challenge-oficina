import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { PrismaClient } from '../src/shared/generated/prisma/client';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { PrismaUnitOfWork } from '../src/shared/database/prisma-unit-of-work';
import { ReservasEstoqueModule } from '../src/modules/reservas-estoque/reservas-estoque.module';
import { RESERVA_ESTOQUE_GATEWAY } from '../src/modules/reservas-estoque/application/ports/tokens';
import type { ReservaEstoqueGateway } from '../src/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ReservarEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import { LiberarReservaEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/liberar-reserva-estoque.use-case';
import { ConsumirReservaEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import { AjustarEstoqueDivergenciaUseCase } from '../src/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';
import { EstoqueInsuficienteReservaError } from '../src/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

function criarPrismaComPoolProprio(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 10000,
  });
  return new PrismaClient({ adapter });
}

describe('Estoque com reserva (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let reservar: ReservarEstoqueUseCase;
  let liberar: LiberarReservaEstoqueUseCase;
  let consumir: ConsumirReservaEstoqueUseCase;
  let ajustar: AjustarEstoqueDivergenciaUseCase;

  const sufixo = `${Date.now()}`;

  async function criarPeca(estoque: number) {
    return prisma.peca.create({
      data: {
        codigo: `PEC-${sufixo}-${randomUUID().slice(0, 6)}`,
        nome: `Peça teste ${sufixo}`,
        precoUnitario: 10,
        quantidadeEstoque: estoque,
      },
    });
  }

  async function criarOs() {
    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '9'),
        email: `cli-${randomUUID()}@test.local`,
        telefone: '11999990000',
      },
    });
    const veiculo = await prisma.veiculo.create({
      data: {
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
        marca: 'Test',
        modelo: 'Test',
        ano: 2024,
        clienteId: cliente.id,
      },
    });
    return prisma.ordemServico.create({
      data: {
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        descricaoProblema: 'teste reserva',
      },
    });
  }

  beforeAll(async () => {
    const databaseUrl = exigirDatabaseUrl();

    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        ReservasEstoqueModule,
      ],
    }).compile();

    prisma = nestModule.get(PrismaService);
    reservar = nestModule.get(ReservarEstoqueUseCase);
    liberar = nestModule.get(LiberarReservaEstoqueUseCase);
    consumir = nestModule.get(ConsumirReservaEstoqueUseCase);
    ajustar = nestModule.get(AjustarEstoqueDivergenciaUseCase);

    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);

    void databaseUrl;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  it('reserva com estoque suficiente', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();

    const out = await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });

    expect(out.linhas).toHaveLength(1);
    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeReservada).toBe(4);
    expect(atualizada.quantidadeEstoque - atualizada.quantidadeReservada).toBe(
      6,
    );
  });

  it('rejeita reserva com estoque insuficiente', async () => {
    const peca = await criarPeca(2);
    const os = await criarOs();

    await expect(
      reservar.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itens: [{ pecaId: peca.id, quantidade: 5 }],
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeReservada).toBe(0);
  });

  it('rollback integral em reserva múltipla quando um item não tem disponibilidade', async () => {
    const pecaOk = await criarPeca(10);
    const pecaRuim = await criarPeca(1);
    const os = await criarOs();

    await expect(
      reservar.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itens: [
          { pecaId: pecaOk.id, quantidade: 2 },
          { pecaId: pecaRuim.id, quantidade: 3 },
        ],
      }),
    ).rejects.toThrow(EstoqueInsuficienteReservaError);

    const [a, b] = await Promise.all([
      prisma.peca.findUniqueOrThrow({ where: { id: pecaOk.id } }),
      prisma.peca.findUniqueOrThrow({ where: { id: pecaRuim.id } }),
    ]);
    expect(a.quantidadeReservada).toBe(0);
    expect(b.quantidadeReservada).toBe(0);
    expect(
      await prisma.reservaEstoque.count({ where: { ordemServicoId: os.id } }),
    ).toBe(0);
  });

  it('reservas concorrentes não deixam disponível negativo', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(5);
    const osA = await criarOs();
    const osB = await criarOs();

    const prismaB = criarPrismaComPoolProprio(databaseUrl);
    await prismaB.$connect();
    const uowB = new PrismaUnitOfWork(
      prismaB as unknown as PrismaService,
      {
        get: () => '15000',
      } as never,
    );
    const gateway = nestModule.get<ReservaEstoqueGateway>(
      RESERVA_ESTOQUE_GATEWAY,
    );
    const reservarB = new ReservarEstoqueUseCase(gateway, uowB);

    const resultados = await Promise.allSettled([
      reservar.execute({
        ordemServicoId: osA.id,
        rodada: 1,
        itens: [{ pecaId: peca.id, quantidade: 4 }],
      }),
      reservarB.execute({
        ordemServicoId: osB.id,
        rodada: 1,
        itens: [{ pecaId: peca.id, quantidade: 4 }],
      }),
    ]);

    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    const falha = resultados.filter((r) => r.status === 'rejected').length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(falha).toBeGreaterThanOrEqual(1);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeReservada).toBeLessThanOrEqual(5);
    expect(
      atualizada.quantidadeEstoque - atualizada.quantidadeReservada,
    ).toBeGreaterThanOrEqual(0);

    await prismaB.$disconnect();
  });

  it('repete reserva idempotente', async () => {
    const peca = await criarPeca(8);
    const os = await criarOs();
    const key = `reserva:test:${randomUUID()}`;

    const first = await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
      idempotencyKey: key,
    });
    const second = await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
      idempotencyKey: key,
    });

    expect(second.reutilizado).toBe(true);
    expect(second.grupoReservaId).toBe(first.grupoReservaId);
    expect(
      await prisma.reservaEstoque.count({ where: { ordemServicoId: os.id } }),
    ).toBe(1);
  });

  it('libera reserva e devolve disponível', async () => {
    const peca = await criarPeca(6);
    const os = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 3 }],
    });

    await liberar.execute({ ordemServicoId: os.id, rodada: 1 });

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeReservada).toBe(0);
    expect(atualizada.quantidadeEstoque).toBe(6);
  });

  it('consumo parcial reduz físico e libera o restante da reserva', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 5 }],
    });

    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 2 }],
    });

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeEstoque).toBe(8);
    expect(atualizada.quantidadeReservada).toBe(0);
  });

  it('divergência gera pendência e ajuste administrativo preserva invariantes', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });

    const resultado = await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 6 }],
    });

    expect(resultado.pendenciaInventarioId).toBeTruthy();

    await ajustar.execute({
      pendenciaId: resultado.pendenciaInventarioId as string,
      pecaId: peca.id,
      quantidadeFisicaNova: 9,
      motivo: 'Inventário físico conferido',
      responsavelId: randomUUID(),
    });

    const pendencia = await prisma.pendenciaOs.findUniqueOrThrow({
      where: { id: resultado.pendenciaInventarioId as string },
    });
    expect(pendencia.resolvida).toBe(true);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeEstoque).toBeGreaterThanOrEqual(
      atualizada.quantidadeReservada,
    );
  });
});
