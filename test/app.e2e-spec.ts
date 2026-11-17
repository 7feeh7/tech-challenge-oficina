import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';

import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { PerfilUsuario, StatusOS } from '../src/shared/generated/prisma/enums';

/**
 * E2E completo do fluxo principal da oficina:
 *   login → criar cliente → criar veículo → catálogo (serviço/peça)
 *   → criar OS → simular pagamento pendente → desistência → consultar
 *
 * Requer PostgreSQL real acessível em DATABASE_URL e par RS256 (JWT_*_KEY).
 */
describe('Fluxo completo da oficina (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let httpServer: any;

  const adminEmail = `admin.e2e+${Date.now()}@oficina.test`;
  const senhaPlain = 'senha-e2e-123';

  const created: {
    usuarioId?: string;
    clienteId?: string;
    veiculoId?: string;
    servicoId?: string;
    pecaId?: string;
    ordemServicoId?: string;
  } = {};

  let token: string;
  let jwtService: JwtService;

  const mensagensDaOs = () =>
    prisma.outboxMensagem.findMany({
      where: {
        envelope: { path: ['ordemServicoId'], equals: created.ordemServicoId },
      },
    });

  beforeAll(async () => {
    exigirDatabaseUrl();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    httpServer = app.getHttpServer();

    prisma = app.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    jwtService = app.get(JwtService);

    const senhaHash = await bcrypt.hash(senhaPlain, 10);
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Admin E2E',
        email: adminEmail,
        senhaHash,
        perfil: PerfilUsuario.ADMINISTRADOR,
        ativo: true,
      },
    });
    created.usuarioId = usuario.id;
  });

  afterAll(async () => {
    if (created.ordemServicoId) {
      await prisma.outboxMensagem.deleteMany({
        where: {
          envelope: {
            path: ['ordemServicoId'],
            equals: created.ordemServicoId,
          },
        },
      });
      await prisma.movimentacaoEstoque.deleteMany({
        where: { ordemServicoId: created.ordemServicoId },
      });
      await prisma.historicoStatusOS.deleteMany({
        where: { ordemServicoId: created.ordemServicoId },
      });
      await prisma.ordemServicoPeca.deleteMany({
        where: { ordemServicoId: created.ordemServicoId },
      });
      await prisma.ordemServicoServico.deleteMany({
        where: { ordemServicoId: created.ordemServicoId },
      });
      await prisma.ordemServico.deleteMany({
        where: { id: created.ordemServicoId },
      });
    }
    if (created.pecaId) {
      await prisma.movimentacaoEstoque.deleteMany({
        where: { pecaId: created.pecaId },
      });
      await prisma.peca.deleteMany({ where: { id: created.pecaId } });
    }
    if (created.servicoId) {
      await prisma.servico.deleteMany({ where: { id: created.servicoId } });
    }
    if (created.veiculoId) {
      await prisma.veiculo.deleteMany({ where: { id: created.veiculoId } });
    }
    if (created.clienteId) {
      await prisma.cliente.deleteMany({ where: { id: created.clienteId } });
    }
    if (created.usuarioId) {
      await prisma.usuario.deleteMany({ where: { id: created.usuarioId } });
    }

    await app.close();
  });

  it('1. POST /auth/login → deve autenticar e retornar token', async () => {
    // Act
    const res = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: adminEmail, senha: senhaPlain })
      .expect(200);

    // Assert
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  it('2. POST /clientes → deve criar cliente', async () => {
    // Arrange
    const payload = {
      nome: 'Cliente E2E',
      cpfCnpj: '39053344705',
      email: `cliente.e2e+${Date.now()}@oficina.test`,
      telefone: '11999998888',
    };

    // Act
    const res = await request(httpServer)
      .post('/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);

    // Assert
    expect(res.body.id).toBeDefined();
    expect(res.body.nome).toBe('Cliente E2E');
    created.clienteId = res.body.id;
  });

  it('3. POST /veiculos → deve criar veículo para o cliente', async () => {
    // Act
    const res = await request(httpServer)
      .post('/v1/veiculos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        placa: 'ABC1D23',
        marca: 'Toyota',
        modelo: 'Corolla',
        ano: 2024,
        clienteId: created.clienteId,
      })
      .expect(201);

    // Assert
    expect(res.body.id).toBeDefined();
    created.veiculoId = res.body.id;
  });

  it('4. POST /servicos e POST /pecas → catálogos para a OS', async () => {
    // Act — serviço
    const servico = await request(httpServer)
      .post('/v1/servicos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: `Troca de Óleo E2E ${Date.now()}`,
        precoBase: 150,
        tempoEstimadoMin: 60,
      })
      .expect(201);
    created.servicoId = servico.body.id;

    // Act — peça
    const peca = await request(httpServer)
      .post('/v1/pecas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        codigo: `FLT-E2E-${Date.now()}`,
        nome: 'Filtro de Óleo E2E',
        precoUnitario: 50,
        quantidadeEstoque: 10,
      })
      .expect(201);
    created.pecaId = peca.body.id;

    // Assert
    expect(created.servicoId).toBeDefined();
    expect(created.pecaId).toBeDefined();
  });

  it('5. POST /ordens-servico → deve criar OS em RECEBIDA com sugestões, histórico e outbox', async () => {
    // Act
    const res = await request(httpServer)
      .post('/v1/ordens-servico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: created.clienteId,
        veiculoId: created.veiculoId,
        descricaoProblema: 'Revisão programada',
        servicos: [{ servicoId: created.servicoId, quantidade: 1 }],
        pecas: [{ pecaId: created.pecaId, quantidade: 2 }],
      })
      .expect(201);

    // Assert
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe(StatusOS.RECEBIDA);
    expect(res.body.rodadaVigente).toBe(1);
    expect(res.body.sugestoes).toHaveLength(2);
    expect(res.body.servicos).toHaveLength(0);
    expect(res.body.pecas).toHaveLength(0);
    created.ordemServicoId = res.body.id;

    const historico = await prisma.historicoStatusOS.findMany({
      where: { ordemServicoId: created.ordemServicoId },
    });
    expect(historico).toHaveLength(1);
    expect(historico[0].statusNovo).toBe(StatusOS.RECEBIDA);

    const outbox = await mensagensDaOs();
    expect(outbox.map((m) => m.eventType).sort()).toEqual([
      'execution.iniciar-diagnostico.v1',
      'ordem-servico.status-changed.v1',
    ]);
  });

  it('5b. POST /ordens-servico com diagnóstico na abertura → 400', async () => {
    await request(httpServer)
      .post('/v1/ordens-servico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: created.clienteId,
        veiculoId: created.veiculoId,
        diagnostico: 'Não pode vir na abertura',
      })
      .expect(400);
  });

  it('5c. PATCH /ordens-servico/:id altera só a descrição; DELETE não existe mais', async () => {
    const res = await request(httpServer)
      .patch(`/v1/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ descricaoProblema: 'Revisão programada e barulho no freio' })
      .expect(200);
    expect(res.body.descricaoProblema).toBe(
      'Revisão programada e barulho no freio',
    );

    await request(httpServer)
      .patch(`/v1/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: StatusOS.EM_EXECUCAO })
      .expect(400);

    await request(httpServer)
      .delete(`/v1/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('5d. rotas legadas /v1/orcamentos removidas', async () => {
    await request(httpServer)
      .post('/v1/orcamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ordemServicoId: created.ordemServicoId, valorTotal: 250 })
      .expect(404);

    await request(httpServer)
      .patch('/v1/orcamentos/00000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APROVADO' })
      .expect(404);

    await request(httpServer)
      .get('/v1/orcamentos')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('5e. diagnóstico concluído (simulado) → OS em EM_DIAGNOSTICO com itens oficiais', async () => {
    // O worker do Execution Service (E28) ainda não existe: o diagnóstico é simulado no banco.
    await prisma.ordemServico.update({
      where: { id: created.ordemServicoId! },
      data: { status: StatusOS.EM_DIAGNOSTICO, prioridadeFila: 5 },
    });
    await prisma.ordemServicoPeca.create({
      data: {
        ordemServicoId: created.ordemServicoId!,
        pecaId: created.pecaId!,
        quantidade: 2,
        precoUnitario: 50,
      },
    });
  });

  it('6. prepara AGUARDANDO_PAGAMENTO sem rota pública de orçamento', async () => {
    const prazo = new Date(Date.now() + 86_400_000);
    await prisma.ordemServico.update({
      where: { id: created.ordemServicoId! },
      data: {
        status: StatusOS.AGUARDANDO_PAGAMENTO,
        prioridadeFila: 3,
        prazoReferenciaReserva: prazo,
      },
    });
  });

  it('7. token de cliente → consulta OS própria e bloqueia acesso cruzado', async () => {
    const clientToken = await jwtService.signAsync(
      {
        sub: created.clienteId,
        tipo: 'CLIENTE',
        perfil: 'CLIENTE',
      },
      {
        privateKey: process.env.JWT_PRIVATE_KEY,
        algorithm: 'RS256',
        issuer: process.env.JWT_ISSUER ?? 'tech-challenge-auth',
        audience: process.env.JWT_AUDIENCE ?? 'tech-challenge-api',
      },
    );

    await request(httpServer)
      .get(`/v1/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    const outroCliente = await request(httpServer)
      .post('/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Outro Cliente E2E',
        cpfCnpj: '52998224725',
        email: `outro.e2e+${Date.now()}@oficina.test`,
        telefone: '11988887777',
      })
      .expect(201);

    const tokenOutro = await jwtService.signAsync(
      {
        sub: outroCliente.body.id,
        tipo: 'CLIENTE',
        perfil: 'CLIENTE',
      },
      {
        privateKey: process.env.JWT_PRIVATE_KEY,
        algorithm: 'RS256',
        issuer: process.env.JWT_ISSUER ?? 'tech-challenge-auth',
        audience: process.env.JWT_AUDIENCE ?? 'tech-challenge-api',
      },
    );

    await request(httpServer)
      .get(`/v1/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${tokenOutro}`)
      .expect(403);

    await prisma.cliente.deleteMany({ where: { id: outroCliente.body.id } });
  });

  it('9. GET /ordens-servico/:id → deve refletir o estado atual', async () => {
    // Act
    const res = await request(httpServer)
      .get(`/v1/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Assert
    expect(res.body.id).toBe(created.ordemServicoId);
    expect(res.body.status).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
  });

  it('9b. POST desistência → EM_CANCELAMENTO, idempotente; retirada ainda recusada (409)', async () => {
    const desistir = () =>
      request(httpServer)
        .post(`/v1/ordens-servico/${created.ordemServicoId}/desistencia`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `desistencia-${created.ordemServicoId}`)
        .send({ motivo: 'Cliente desistiu do serviço' });

    const primeira = await desistir().expect(200);
    expect(primeira.body.status).toBe(StatusOS.EM_CANCELAMENTO);
    expect(primeira.body.etapaOrigemCancelamento).toBe(
      StatusOS.AGUARDANDO_PAGAMENTO,
    );

    await desistir().expect(200);

    const historico = await prisma.historicoStatusOS.findMany({
      where: {
        ordemServicoId: created.ordemServicoId!,
        statusNovo: StatusOS.EM_CANCELAMENTO,
      },
    });
    expect(historico).toHaveLength(1);

    await request(httpServer)
      .post(`/v1/ordens-servico/${created.ordemServicoId}/retirada`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `retirada-${created.ordemServicoId}`)
      .send({})
      .expect(409);
  });

  it('10. GET /ordens-servico/metricas/tempo-medio → deve retornar métricas', async () => {
    // Act
    const res = await request(httpServer)
      .get('/v1/ordens-servico/metricas/tempo-medio')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Assert
    expect(res.body).toHaveProperty('totalOrdens');
    expect(res.body).toHaveProperty('tempoMedioExecucaoMs');
    expect(res.body).toHaveProperty('tempoMedioCicloTotalMs');
  });

  it('11. GET sem token → deve retornar 401', async () => {
    await request(httpServer).get('/v1/clientes').expect(401);
  });
});
