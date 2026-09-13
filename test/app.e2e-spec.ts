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
  PerfilUsuario,
  StatusOS,
  StatusOrcamento,
} from '../src/shared/generated/prisma/enums';

/**
 * E2E completo do fluxo principal da oficina:
 *   login → criar cliente → criar veículo → catálogo (serviço/peça)
 *   → criar OS → criar orçamento → aprovar → consultar
 *
 * Requer PostgreSQL real acessível em DATABASE_URL e JWT_SECRET definido.
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
    orcamentoId?: string;
  } = {};

  let token: string;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
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
    if (created.orcamentoId) {
      await prisma.orcamento.deleteMany({ where: { id: created.orcamentoId } });
    }
    if (created.ordemServicoId) {
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
      .post('/auth/login')
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
      .post('/clientes')
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
      .post('/veiculos')
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
      .post('/servicos')
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
      .post('/pecas')
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

  it('5. POST /ordens-servico → deve criar OS em RECEBIDA e registrar histórico', async () => {
    // Act
    const res = await request(httpServer)
      .post('/ordens-servico')
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
    created.ordemServicoId = res.body.id;

    const historico = await prisma.historicoStatusOS.findMany({
      where: { ordemServicoId: created.ordemServicoId },
    });
    expect(historico.length).toBeGreaterThanOrEqual(1);
    expect(historico[0].statusNovo).toBe(StatusOS.RECEBIDA);
  });

  it('6. POST /orcamentos → deve criar orçamento e mover OS para AGUARDANDO_APROVACAO', async () => {
    // Act
    const res = await request(httpServer)
      .post('/orcamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ordemServicoId: created.ordemServicoId,
        valorTotal: 250,
        observacoes: 'Orçamento E2E',
      })
      .expect(201);

    // Assert
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe(StatusOrcamento.AGUARDANDO_APROVACAO);
    created.orcamentoId = res.body.id;

    const os = await prisma.ordemServico.findUnique({
      where: { id: created.ordemServicoId! },
    });
    expect(os?.status).toBe(StatusOS.AGUARDANDO_APROVACAO);
  });

  it('7. token de cliente → consulta OS própria e bloqueia acesso cruzado', async () => {
    const clientToken = await jwtService.signAsync(
      {
        sub: created.clienteId,
        tipo: 'CLIENTE',
        perfil: 'CLIENTE',
      },
      {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER ?? 'tech-challenge-auth',
        audience: process.env.JWT_AUDIENCE ?? 'tech-challenge-api',
      },
    );

    await request(httpServer)
      .get(`/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    const outroCliente = await request(httpServer)
      .post('/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Outro Cliente E2E',
        cpfCnpj: '15396887700',
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
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER ?? 'tech-challenge-auth',
        audience: process.env.JWT_AUDIENCE ?? 'tech-challenge-api',
      },
    );

    await request(httpServer)
      .get(`/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${tokenOutro}`)
      .expect(403);

    await prisma.cliente.deleteMany({ where: { id: outroCliente.body.id } });
  });

  it('8. PATCH /orcamentos/:id → APROVADO deve dar baixa no estoque e mover OS para EM_EXECUCAO', async () => {
    // Arrange
    const pecaAntes = await prisma.peca.findUnique({
      where: { id: created.pecaId! },
    });

    // Act
    await request(httpServer)
      .patch(`/orcamentos/${created.orcamentoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: StatusOrcamento.APROVADO })
      .expect(200);

    // Assert
    const pecaDepois = await prisma.peca.findUnique({
      where: { id: created.pecaId! },
    });
    expect(pecaDepois!.quantidadeEstoque).toBe(
      pecaAntes!.quantidadeEstoque - 2,
    );

    const os = await prisma.ordemServico.findUnique({
      where: { id: created.ordemServicoId! },
    });
    expect(os?.status).toBe(StatusOS.EM_EXECUCAO);
    expect(os?.iniciadaEm).toBeTruthy();
  });

  it('9. GET /ordens-servico/:id → deve refletir o estado final', async () => {
    // Act
    const res = await request(httpServer)
      .get(`/ordens-servico/${created.ordemServicoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Assert
    expect(res.body.id).toBe(created.ordemServicoId);
    expect(res.body.status).toBe(StatusOS.EM_EXECUCAO);
  });

  it('10. GET /ordens-servico/metricas/tempo-medio → deve retornar métricas', async () => {
    // Act
    const res = await request(httpServer)
      .get('/ordens-servico/metricas/tempo-medio')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Assert
    expect(res.body).toHaveProperty('totalOrdens');
    expect(res.body).toHaveProperty('tempoMedioExecucaoMs');
    expect(res.body).toHaveProperty('tempoMedioCicloTotalMs');
  });

  it('11. GET sem token → deve retornar 401', async () => {
    await request(httpServer).get('/clientes').expect(401);
  });
});
