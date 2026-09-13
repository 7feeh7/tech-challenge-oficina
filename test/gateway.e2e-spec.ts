import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { PerfilUsuario } from '../src/shared/generated/prisma/enums';
import { registerCorrelationIdHook } from '../src/shared/http/correlation-id.hook';

describe('Gateway contract (e2e)', () => {
  let app: NestFastifyApplication;
  let httpServer: unknown;
  let prisma: PrismaService;
  let token: string;

  const adminEmail = `gateway.e2e+${Date.now()}@oficina.test`;
  const senhaPlain = 'senha-gateway-e2e';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    registerCorrelationIdHook(app.getHttpAdapter().getInstance());
    app.setGlobalPrefix('v1', {
      exclude: [
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/ready', method: RequestMethod.ALL },
      ],
    });
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

    const senhaHash = await bcrypt.hash(senhaPlain, 10);
    await prisma.usuario.create({
      data: {
        nome: 'Admin Gateway E2E',
        email: adminEmail,
        senhaHash,
        perfil: PerfilUsuario.ADMINISTRADOR,
        ativo: true,
      },
    });

    const login = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: adminEmail, senha: senhaPlain })
      .expect(200);

    token = login.body.token;
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('GET /health stays outside /v1 and returns correlation id', async () => {
    const res = await request(httpServer)
      .get('/health')
      .set('X-Correlation-Id', 'corr-test-123')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.headers['x-correlation-id']).toBe('corr-test-123');
  });

  it('creates correlation id when header is absent', async () => {
    const res = await request(httpServer).get('/health').expect(200);

    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('replays POST /v1/ordens-servico with same Idempotency-Key', async () => {
    const cliente = await request(httpServer)
      .post('/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Cliente Idempotencia',
        cpfCnpj: '39053344705',
        email: `idempotencia+${Date.now()}@oficina.test`,
        telefone: '11999990000',
      })
      .expect(201);

    const veiculo = await request(httpServer)
      .post('/v1/veiculos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        placa: 'IDM1D23',
        marca: 'Fiat',
        modelo: 'Uno',
        ano: 2020,
        clienteId: cliente.body.id,
      })
      .expect(201);

    const payload = {
      clienteId: cliente.body.id,
      veiculoId: veiculo.body.id,
      descricaoProblema: 'Teste idempotencia',
    };

    const key = `os-${Date.now()}`;

    const first = await request(httpServer)
      .post('/v1/ordens-servico')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    const second = await request(httpServer)
      .post('/v1/ordens-servico')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const count = await prisma.ordemServico.count({
      where: { clienteId: cliente.body.id },
    });
    expect(count).toBe(1);

    await prisma.historicoStatusOS.deleteMany({
      where: { ordemServicoId: first.body.id },
    });
    await prisma.ordemServico.deleteMany({ where: { id: first.body.id } });
    await prisma.veiculo.deleteMany({ where: { id: veiculo.body.id } });
    await prisma.cliente.deleteMany({ where: { id: cliente.body.id } });
    await prisma.idempotencyRecord.deleteMany({
      where: { idempotencyKey: key },
    });
  });
});
