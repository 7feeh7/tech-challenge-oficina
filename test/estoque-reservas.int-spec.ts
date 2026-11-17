import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { PrismaClient } from '../src/shared/generated/prisma/client';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { PrismaUnitOfWork } from '../src/shared/database/prisma-unit-of-work';
import { MovimentacoesEstoqueModule } from '../src/modules/movimentacoes-estoque/movimentacoes-estoque.module';
import { TipoMovimentacaoEstoque } from '../src/modules/movimentacoes-estoque/domain/tipo-movimentacao-estoque';
import { RegistrarMovimentacaoUseCase } from '../src/modules/movimentacoes-estoque/application/use-cases/registrar-movimentacao.use-case';
import { PecasModule } from '../src/modules/pecas/pecas.module';
import { AtualizarPecaUseCase } from '../src/modules/pecas/application/use-cases/atualizar-peca.use-case';
import { ReservasEstoqueModule } from '../src/modules/reservas-estoque/reservas-estoque.module';
import { RESERVA_ESTOQUE_GATEWAY } from '../src/modules/reservas-estoque/application/ports/tokens';
import type { MovimentacaoEstoqueGateway } from '../src/modules/movimentacoes-estoque/application/ports/movimentacao-estoque.gateway';
import { MOVIMENTACAO_ESTOQUE_GATEWAY } from '../src/modules/movimentacoes-estoque/application/ports/tokens';
import type { PecaGateway } from '../src/modules/pecas/application/ports/peca.gateway';
import { PECA_GATEWAY } from '../src/modules/pecas/application/ports/tokens';
import type { ReservaEstoqueGateway } from '../src/modules/reservas-estoque/application/ports/reserva-estoque.gateway';
import { ReservarEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import { LiberarReservaEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/liberar-reserva-estoque.use-case';
import { ConsumirReservaEstoqueUseCase } from '../src/modules/reservas-estoque/application/use-cases/consumir-reserva-estoque.use-case';
import { AjustarEstoqueDivergenciaUseCase } from '../src/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';
import {
  EstoqueInsuficienteReservaError,
  ReservaJaProcessadaError,
  ReservaEstoqueNaoEncontradaError,
  PendenciaInventarioJaResolvidaError,
} from '../src/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { SituacaoReservaEstoque } from '../src/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

interface PoolBDosEstoque {
  prismaB: PrismaClient;
  liberar: LiberarReservaEstoqueUseCase;
  consumir: ConsumirReservaEstoqueUseCase;
  ajustar: AjustarEstoqueDivergenciaUseCase;
  reservar: ReservarEstoqueUseCase;
  registrar: RegistrarMovimentacaoUseCase;
  atualizarPeca: AtualizarPecaUseCase;
}

function criarPoolB(
  databaseUrl: string,
  deps: {
    reservaGateway: ReservaEstoqueGateway;
    movimentacaoGateway: MovimentacaoEstoqueGateway;
    pecaGateway: PecaGateway;
  },
): PoolBDosEstoque {
  const prismaB = criarPrismaComPoolProprio(databaseUrl);
  const uowB = new PrismaUnitOfWork(
    prismaB as unknown as PrismaService,
    { get: () => '15000' } as never,
  );
  return {
    prismaB,
    liberar: new LiberarReservaEstoqueUseCase(deps.reservaGateway, uowB),
    consumir: new ConsumirReservaEstoqueUseCase(deps.reservaGateway, uowB),
    ajustar: new AjustarEstoqueDivergenciaUseCase(deps.reservaGateway, uowB),
    reservar: new ReservarEstoqueUseCase(deps.reservaGateway, uowB),
    registrar: new RegistrarMovimentacaoUseCase(deps.movimentacaoGateway, uowB),
    atualizarPeca: new AtualizarPecaUseCase(deps.pecaGateway, uowB),
  };
}

async function somaReservasAtivasDaOs(
  cliente: PrismaService,
  pecaId: string,
  ordemServicoId: string,
): Promise<number> {
  const agg = await cliente.reservaEstoque.aggregate({
    where: {
      pecaId,
      ordemServicoId,
      situacao: SituacaoReservaEstoque.ATIVA,
    },
    _sum: { quantidade: true },
  });
  return agg._sum.quantidade ?? 0;
}

async function somaReservasAtivasPeca(
  cliente: PrismaService,
  pecaId: string,
): Promise<number> {
  const agg = await cliente.reservaEstoque.aggregate({
    where: { pecaId, situacao: SituacaoReservaEstoque.ATIVA },
    _sum: { quantidade: true },
  });
  return agg._sum.quantidade ?? 0;
}

async function assertInvarianteReservadoPeca(
  cliente: PrismaService,
  pecaId: string,
): Promise<void> {
  const peca = await cliente.peca.findUniqueOrThrow({ where: { id: pecaId } });
  const somaAtiva = await somaReservasAtivasPeca(cliente, pecaId);
  expect(peca.quantidadeReservada).toBe(somaAtiva);
  expect(peca.quantidadeReservada).toBeGreaterThanOrEqual(0);
  expect(peca.quantidadeEstoque).toBeGreaterThanOrEqual(
    peca.quantidadeReservada,
  );
}

function obterGatewaysEstoque(modulo: TestingModule) {
  return {
    reservaGateway: modulo.get<ReservaEstoqueGateway>(RESERVA_ESTOQUE_GATEWAY),
    movimentacaoGateway: modulo.get<MovimentacaoEstoqueGateway>(
      MOVIMENTACAO_ESTOQUE_GATEWAY,
    ),
    pecaGateway: modulo.get<PecaGateway>(PECA_GATEWAY),
  };
}

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
  let registrarMovimentacao: RegistrarMovimentacaoUseCase;

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
        correlationId: randomUUID(),
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
        MovimentacoesEstoqueModule,
        PecasModule,
      ],
    }).compile();

    prisma = nestModule.get(PrismaService);
    reservar = nestModule.get(ReservarEstoqueUseCase);
    liberar = nestModule.get(LiberarReservaEstoqueUseCase);
    consumir = nestModule.get(ConsumirReservaEstoqueUseCase);
    ajustar = nestModule.get(AjustarEstoqueDivergenciaUseCase);
    registrarMovimentacao = nestModule.get(RegistrarMovimentacaoUseCase);

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

  it('rollback após escrita efetiva no 1º item quando o 2º item falha na persistência', async () => {
    const p1 = await criarPeca(12);
    const p2 = await criarPeca(12);
    const [pecaPrimeira, pecaSegunda] = [p1, p2].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const os = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: pecaSegunda.id, quantidade: 1 }],
    });

    const snapPrimeira = await prisma.peca.findUniqueOrThrow({
      where: { id: pecaPrimeira.id },
    });
    const snapSegunda = await prisma.peca.findUniqueOrThrow({
      where: { id: pecaSegunda.id },
    });
    const reservasAntes = await prisma.reservaEstoque.count({
      where: { ordemServicoId: os.id },
    });
    expect(pecaPrimeira.id.localeCompare(pecaSegunda.id)).toBeLessThan(0);

    let erroLancado: unknown;
    try {
      await reservar.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itens: [
          { pecaId: pecaPrimeira.id, quantidade: 2 },
          { pecaId: pecaSegunda.id, quantidade: 1 },
        ],
      });
    } catch (erro) {
      erroLancado = erro;
    }

    expect(erroLancado).toBeDefined();
    const prismaErro = erroLancado as {
      code?: string;
      meta?: { modelName?: string; target?: string[] };
    };
    expect(prismaErro.code).toBe('P2002');
    expect(prismaErro.meta?.modelName).toBe('ReservaEstoque');

    const depoisPrimeira = await prisma.peca.findUniqueOrThrow({
      where: { id: pecaPrimeira.id },
    });
    const depoisSegunda = await prisma.peca.findUniqueOrThrow({
      where: { id: pecaSegunda.id },
    });
    expect(depoisPrimeira.quantidadeReservada).toBe(
      snapPrimeira.quantidadeReservada,
    );
    expect(depoisPrimeira.quantidadeEstoque).toBe(
      snapPrimeira.quantidadeEstoque,
    );
    expect(depoisSegunda.quantidadeReservada).toBe(
      snapSegunda.quantidadeReservada,
    );
    expect(depoisSegunda.quantidadeEstoque).toBe(snapSegunda.quantidadeEstoque);
    expect(
      await prisma.reservaEstoque.count({ where: { ordemServicoId: os.id } }),
    ).toBe(reservasAntes);
    expect(
      await prisma.reservaEstoque.count({
        where: { ordemServicoId: os.id, pecaId: pecaPrimeira.id },
      }),
    ).toBe(0);
    await assertInvarianteReservadoPeca(prisma, pecaPrimeira.id);
    await assertInvarianteReservadoPeca(prisma, pecaSegunda.id);
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

    const responsavelId = randomUUID();
    await ajustar.execute({
      pendenciaId: resultado.pendenciaInventarioId as string,
      pecaId: peca.id,
      quantidadeFisicaNova: 9,
      motivo: 'Inventário físico conferido',
      responsavelId,
    });

    const pendencia = await prisma.pendenciaOs.findUniqueOrThrow({
      where: { id: resultado.pendenciaInventarioId as string },
    });
    expect(pendencia.resolvida).toBe(true);

    const auditoria = await prisma.ajusteEstoqueAdministrativo.findFirstOrThrow(
      { where: { pendenciaId: pendencia.id } },
    );
    expect(auditoria.motivo).toBe('Inventário físico conferido');
    expect(auditoria.responsavelId).toBe(responsavelId);
    expect(auditoria.quantidadeFisicaNova).toBe(9);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeEstoque).toBeGreaterThanOrEqual(
      atualizada.quantidadeReservada,
    );
  });

  it('duas liberações concorrentes não duplicam devolução ao disponível', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(20);
    const os = await criarOs();
    const osOutra = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });
    await reservar.execute({
      ordemServicoId: osOutra.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 3 }],
    });

    const reservadoOutraAntes = await somaReservasAtivasDaOs(
      prisma,
      peca.id,
      osOutra.id,
    );

    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));

    await Promise.allSettled([
      liberar.execute({
        ordemServicoId: os.id,
        rodada: 1,
        idempotencyKey: `lib-a-${randomUUID()}`,
      }),
      poolB.liberar.execute({
        ordemServicoId: os.id,
        rodada: 1,
        idempotencyKey: `lib-b-${randomUUID()}`,
      }),
    ]);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    const reservadoOutraDepois = await somaReservasAtivasDaOs(
      prisma,
      peca.id,
      osOutra.id,
    );

    expect(reservadoOutraDepois).toBe(reservadoOutraAntes);
    expect(atualizada.quantidadeReservada).toBe(reservadoOutraAntes);
    expect(
      atualizada.quantidadeEstoque - atualizada.quantidadeReservada,
    ).toBeGreaterThanOrEqual(0);
    await assertInvarianteReservadoPeca(prisma, peca.id);

    await poolB.prismaB.$disconnect();
  });

  it('duas liberações concorrentes sem chave de idempotência não duplicam efeito', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(20);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });

    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));
    const antes = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });

    await Promise.allSettled([
      liberar.execute({ ordemServicoId: os.id, rodada: 1 }),
      poolB.liberar.execute({ ordemServicoId: os.id, rodada: 1 }),
    ]);

    const depois = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(depois.quantidadeReservada).toBe(0);
    expect(depois.quantidadeEstoque).toBe(antes.quantidadeEstoque);
    await assertInvarianteReservadoPeca(prisma, peca.id);
    await poolB.prismaB.$disconnect();
  });

  it('dois consumos concorrentes não decrementam o físico em duplicidade', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(15);
    const os = await criarOs();
    const osOutra = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 5 }],
    });
    await reservar.execute({
      ordemServicoId: osOutra.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 3 }],
    });
    const reservadoOutraAntes = await somaReservasAtivasDaOs(
      prisma,
      peca.id,
      osOutra.id,
    );

    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));

    const resultados = await Promise.allSettled([
      consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca.id, quantidade: 3 }],
        idempotencyKey: `c-a-${randomUUID()}`,
      }),
      poolB.consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca.id, quantidade: 3 }],
        idempotencyKey: `c-b-${randomUUID()}`,
      }),
    ]);

    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeEstoque).toBe(12);
    expect(atualizada.quantidadeReservada).toBe(reservadoOutraAntes);
    expect(
      await prisma.pendenciaOs.count({ where: { ordemServicoId: os.id } }),
    ).toBe(0);
    expect(await somaReservasAtivasDaOs(prisma, peca.id, osOutra.id)).toBe(
      reservadoOutraAntes,
    );
    await assertInvarianteReservadoPeca(prisma, peca.id);

    await poolB.prismaB.$disconnect();
  });

  it('dois consumos concorrentes sem chave não duplicam decremento', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(12);
    const os = await criarOs();
    const osOutra = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });
    await reservar.execute({
      ordemServicoId: osOutra.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    const reservadoOutraAntes = await somaReservasAtivasDaOs(
      prisma,
      peca.id,
      osOutra.id,
    );

    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));
    const resultados = await Promise.allSettled([
      consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca.id, quantidade: 4 }],
      }),
      poolB.consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca.id, quantidade: 4 }],
      }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeEstoque).toBe(8);
    expect(await somaReservasAtivasDaOs(prisma, peca.id, osOutra.id)).toBe(
      reservadoOutraAntes,
    );
    await assertInvarianteReservadoPeca(prisma, peca.id);
    await poolB.prismaB.$disconnect();
  });

  it('consumo concorrente com liberação aplica só um efeito (com e sem chave)', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(20);
    const os = await criarOs();
    const osOutra = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 5 }],
    });
    await reservar.execute({
      ordemServicoId: osOutra.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 3 }],
    });

    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));
    const fisicoAntes = (
      await prisma.peca.findUniqueOrThrow({
        where: { id: peca.id },
      })
    ).quantidadeEstoque;

    await Promise.allSettled([
      consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca.id, quantidade: 5 }],
        idempotencyKey: `mix-c-${randomUUID()}`,
      }),
      poolB.liberar.execute({
        ordemServicoId: os.id,
        rodada: 1,
        idempotencyKey: `mix-l-${randomUUID()}`,
      }),
    ]);

    const linha = await prisma.reservaEstoque.findFirst({
      where: { ordemServicoId: os.id, rodada: 1, pecaId: peca.id },
    });
    expect(linha?.situacao).not.toBe(SituacaoReservaEstoque.ATIVA);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect([fisicoAntes, fisicoAntes - 5]).toContain(
      atualizada.quantidadeEstoque,
    );
    expect(await somaReservasAtivasDaOs(prisma, peca.id, osOutra.id)).toBe(3);
    await assertInvarianteReservadoPeca(prisma, peca.id);

    await poolB.prismaB.$disconnect();

    const peca2 = await criarPeca(12);
    const os2 = await criarOs();
    await reservar.execute({
      ordemServicoId: os2.id,
      rodada: 1,
      itens: [{ pecaId: peca2.id, quantidade: 3 }],
    });
    const poolB2 = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));
    await Promise.allSettled([
      consumir.execute({
        ordemServicoId: os2.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca2.id, quantidade: 3 }],
      }),
      poolB2.liberar.execute({ ordemServicoId: os2.id, rodada: 1 }),
    ]);
    await assertInvarianteReservadoPeca(prisma, peca2.id);
    await poolB2.prismaB.$disconnect();
  });

  it('consumo repetido não cria pendência espúria', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });

    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 2 }],
    });

    await expect(
      consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca.id, quantidade: 1 }],
      }),
    ).rejects.toThrow(ReservaJaProcessadaError);

    expect(
      await prisma.pendenciaOs.count({ where: { ordemServicoId: os.id } }),
    ).toBe(0);
  });

  it('liberação repetida não altera peça; consumo após liberar retorna 409', async () => {
    const peca = await criarPeca(10);
    const os = await criarOs();
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 2 }],
    });
    await liberar.execute({ ordemServicoId: os.id, rodada: 1 });

    const aposPrimeira = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    await liberar.execute({ ordemServicoId: os.id, rodada: 1 });
    const aposSegunda = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(aposSegunda.quantidadeReservada).toBe(
      aposPrimeira.quantidadeReservada,
    );
    expect(aposSegunda.quantidadeEstoque).toBe(aposPrimeira.quantidadeEstoque);

    await expect(
      consumir.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itensUtilizados: [{ pecaId: peca.id, quantidade: 1 }],
      }),
    ).rejects.toThrow(ReservaJaProcessadaError);
  });

  it('consumo em rodada inexistente retorna 404', async () => {
    const os = await criarOs();

    await expect(
      consumir.execute({
        ordemServicoId: os.id,
        rodada: 99,
        itensUtilizados: [{ pecaId: randomUUID(), quantidade: 1 }],
      }),
    ).rejects.toThrow(ReservaEstoqueNaoEncontradaError);
  });

  it('dois ajustes concorrentes na mesma pendência resolvem uma vez', async () => {
    const databaseUrl = exigirDatabaseUrl();
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

    const responsavel = randomUUID();
    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));

    const inputBase = {
      pendenciaId: resultado.pendenciaInventarioId as string,
      pecaId: peca.id,
      quantidadeFisicaNova: 9,
      motivo: 'Conferência física',
      responsavelId: responsavel,
    };

    const resultados = await Promise.allSettled([
      ajustar.execute(inputBase),
      poolB.ajustar.execute({ ...inputBase, motivo: 'Conferência física B' }),
    ]);

    expect(resultados.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(resultados.some((r) => r.status === 'rejected')).toBe(true);
    const rejeicao = resultados.find((r) => r.status === 'rejected');
    expect((rejeicao as PromiseRejectedResult).reason).toBeInstanceOf(
      PendenciaInventarioJaResolvidaError,
    );

    expect(
      await prisma.ajusteEstoqueAdministrativo.count({
        where: { pendenciaId: resultado.pendenciaInventarioId as string },
      }),
    ).toBe(1);

    await poolB.prismaB.$disconnect();
  });

  it('ajuste administrativo concorrente com movimentações físicas preserva invariantes', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(22);
    const os = await criarOs();

    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });

    const resultado = await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 7 }],
    });
    expect(resultado.pendenciaInventarioId).toBeTruthy();

    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));
    const responsavel = randomUUID();
    const inputAjuste = {
      pendenciaId: resultado.pendenciaInventarioId as string,
      pecaId: peca.id,
      quantidadeFisicaNova: 20,
      motivo: 'Inventário com movimentação concorrente',
      responsavelId: responsavel,
    };

    const concorrencia = await Promise.allSettled([
      ajustar.execute(inputAjuste),
      poolB.registrar.execute({
        pecaId: peca.id,
        tipo: TipoMovimentacaoEstoque.ENTRADA,
        quantidade: 4,
      }),
      registrarMovimentacao.execute({
        pecaId: peca.id,
        tipo: TipoMovimentacaoEstoque.BAIXA,
        quantidade: 2,
      }),
    ]);

    expect(concorrencia.every((r) => r.status === 'fulfilled')).toBe(true);

    const pendencia = await prisma.pendenciaOs.findUniqueOrThrow({
      where: { id: resultado.pendenciaInventarioId as string },
    });
    expect(pendencia.resolvida).toBe(true);
    expect(
      await prisma.ajusteEstoqueAdministrativo.count({
        where: { pendenciaId: pendencia.id },
      }),
    ).toBe(1);

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeEstoque).toBeGreaterThanOrEqual(
      atualizada.quantidadeReservada,
    );
    await assertInvarianteReservadoPeca(prisma, peca.id);
    await poolB.prismaB.$disconnect();
  });

  it('concorrência entre movimentação, atualização física, reserva e consumo preserva invariantes', async () => {
    const databaseUrl = exigirDatabaseUrl();
    const peca = await criarPeca(40);
    const os = await criarOs();

    const poolB = criarPoolB(databaseUrl, obterGatewaysEstoque(nestModule));

    const resultados = await Promise.allSettled([
      reservar.execute({
        ordemServicoId: os.id,
        rodada: 1,
        itens: [{ pecaId: peca.id, quantidade: 6 }],
      }),
      poolB.registrar.execute({
        pecaId: peca.id,
        tipo: TipoMovimentacaoEstoque.ENTRADA,
        quantidade: 5,
      }),
      registrarMovimentacao.execute({
        pecaId: peca.id,
        tipo: TipoMovimentacaoEstoque.BAIXA,
        quantidade: 3,
      }),
      poolB.atualizarPeca.execute(peca.id, { quantidadeEstoque: 45 }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled').length).toBe(
      resultados.length,
    );

    await consumir.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itensUtilizados: [{ pecaId: peca.id, quantidade: 2 }],
    });

    const atualizada = await prisma.peca.findUniqueOrThrow({
      where: { id: peca.id },
    });
    expect(atualizada.quantidadeEstoque).toBeGreaterThanOrEqual(
      atualizada.quantidadeReservada,
    );
    await assertInvarianteReservadoPeca(prisma, peca.id);

    await poolB.prismaB.$disconnect();
  });
});
