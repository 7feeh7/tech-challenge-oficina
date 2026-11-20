import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { configurarAplicacaoHttp } from '../src/shared/http/configurar-aplicacao-http';
import { PrismaService } from '../src/shared/database/prisma.service';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import {
  PerfilUsuario,
  SituacaoReservaEstoque,
} from '../src/shared/generated/prisma/enums';
import { JsonLoggerService } from '../src/shared/observability/json-logger.service';
import { registerRequestObservabilityHook } from '../src/shared/observability/request-observability.hook';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';

describe('Resolução manual de consumo (e2e)', () => {
  let app: NestFastifyApplication;
  let httpServer: unknown;
  let prisma: PrismaService;
  let reservar: ReservarEstoqueUseCase;

  const adminEmail = `admin-resolucao-e2e+${Date.now()}@oficina.test`;
  const atendenteEmail = `atendente-resolucao-e2e+${Date.now()}@oficina.test`;
  const senhaPlain = 'senha-resolucao-e2e';
  let tokenAdmin: string;
  let tokenAtendente: string;
  let adminSub: string;

  async function login(email: string, senha: string) {
    const res = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    return res.body.token as string;
  }

  async function prepararPendencia() {
    const peca = await prisma.peca.create({
      data: {
        codigo: `E2E-${randomUUID().slice(0, 8)}`,
        nome: 'Peça E2E',
        precoUnitario: 12,
        quantidadeEstoque: 30,
      },
    });
    const cliente = await prisma.cliente.create({
      data: {
        nome: 'Cliente E2E resolução',
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '7'),
        email: `cli-e2e-${randomUUID()}@test.local`,
        telefone: '11977776666',
      },
    });
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId: cliente.id,
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
        marca: 'M',
        modelo: 'M',
        ano: 2024,
      },
    });
    const os = await prisma.ordemServico.create({
      data: {
        correlationId: randomUUID(),
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        status: 'EM_CANCELAMENTO',
      },
    });
    await reservar.execute({
      ordemServicoId: os.id,
      rodada: 1,
      itens: [{ pecaId: peca.id, quantidade: 4 }],
    });
    const pendencia = await prisma.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: os.id,
        rodada: 1,
        tipo: 'INVENTARIO',
        detalhes: {
          natureza: 'INFORMACAO_INSUFICIENTE',
          conteudo: {},
        },
      },
    });
    return { os, peca, pendencia };
  }

  beforeAll(async () => {
    exigirDatabaseUrl();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    registerRequestObservabilityHook(
      app.getHttpAdapter().getInstance(),
      app.get(JsonLoggerService),
    );
    configurarAplicacaoHttp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    httpServer = app.getHttpServer();
    prisma = app.get(PrismaService);
    reservar = app.get(ReservarEstoqueUseCase);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);

    const senhaHash = await bcrypt.hash(senhaPlain, 10);
    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin Resolução E2E',
        email: adminEmail,
        senhaHash,
        perfil: PerfilUsuario.ADMINISTRADOR,
        ativo: true,
      },
    });
    adminSub = admin.id;
    await prisma.usuario.create({
      data: {
        nome: 'Atendente E2E',
        email: atendenteEmail,
        senhaHash,
        perfil: PerfilUsuario.ATENDENTE,
        ativo: true,
      },
    });
    tokenAdmin = await login(adminEmail, senhaPlain);
    tokenAtendente = await login(atendenteEmail, senhaPlain);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { in: [adminEmail, atendenteEmail] } },
    });
    await app.close();
  });

  it('recusa sem autenticação', async () => {
    const { pendencia, peca } = await prepararPendencia();
    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Idempotency-Key', randomUUID())
      .send({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 3 }],
        motivo: 'teste',
      })
      .expect(401);
  });

  it('recusa perfil não autorizado', async () => {
    const { pendencia, peca } = await prepararPendencia();
    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAtendente}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 3 }],
        motivo: 'teste',
      })
      .expect(403);
  });

  it('exige Idempotency-Key', async () => {
    const { pendencia } = await prepararPendencia();
    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        pendenciaId: pendencia.id,
        itensConsumidos: [],
        itensLiberados: [],
        motivo: 'teste',
      })
      .expect(400);
  });

  it('valida campos obrigatórios e motivo', async () => {
    const { pendencia, peca } = await prepararPendencia();
    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: -1 }],
        itensLiberados: [],
        motivo: 'x',
      })
      .expect(400);

    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        pendenciaId: pendencia.id,
        itensConsumidos: [],
        itensLiberados: [],
        motivo: 'a'.repeat(501),
      })
      .expect(400);
  });

  it('ADMIN resolve pendência com responsável autenticado e idempotência', async () => {
    const { pendencia, peca, os } = await prepararPendencia();
    const estoqueAntes = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    const idem = `resolucao-e2e:${pendencia.id}`;
    const body = {
      pendenciaId: pendencia.id,
      itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
      itensLiberados: [{ pecaId: peca.id, quantidade: 3 }],
      motivo: 'decisão administrativa e2e',
    };

    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', idem)
      .send(body)
      .expect(204);

    const resolucao = await prisma.resolucaoConsumoManual.findUniqueOrThrow({
      where: {
        ordemServicoId_rodada: { ordemServicoId: os.id, rodada: 1 },
      },
    });
    expect(resolucao.responsavelId).toBe(adminSub);
    expect(resolucao.pendenciaId).toBe(pendencia.id);
    expect(
      await prisma.consumoAplicadoOs.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(0);
    const pend = await prisma.pendenciaOs.findUniqueOrThrow({
      where: { id: pendencia.id },
    });
    expect(pend.resolvida).toBe(true);
    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: os.id, pecaId: peca.id },
    });
    expect(reserva.situacao).toBe(SituacaoReservaEstoque.CONSUMIDA);
    const estoqueDepois = (
      await prisma.peca.findUniqueOrThrow({ where: { id: peca.id } })
    ).quantidadeEstoque;
    expect(estoqueDepois).toBe(estoqueAntes - 1);

    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', idem)
      .send(body)
      .expect(204);
    expect(
      await prisma.resolucaoConsumoManual.count({
        where: { ordemServicoId: os.id, rodada: 1 },
      }),
    ).toBe(1);
  });

  it('rejeita idempotência incompatível sem efeito adicional', async () => {
    const { pendencia, peca } = await prepararPendencia();
    const idem = `resolucao-incompat:${pendencia.id}`;
    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', idem)
      .send({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 1 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 3 }],
        motivo: 'primeiro',
      })
      .expect(204);

    await request(httpServer)
      .post('/v1/reservas-estoque/resolucoes-consumo-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', idem)
      .send({
        pendenciaId: pendencia.id,
        itensConsumidos: [{ pecaId: peca.id, quantidade: 2 }],
        itensLiberados: [{ pecaId: peca.id, quantidade: 2 }],
        motivo: 'segundo corpo',
      })
      .expect(409);

    const reserva = await prisma.reservaEstoque.findFirstOrThrow({
      where: { ordemServicoId: pendencia.ordemServicoId, pecaId: peca.id },
    });
    expect(reserva.quantidadeConsumida).toBe(1);
  });
});
