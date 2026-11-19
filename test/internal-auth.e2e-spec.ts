import { Controller, Get, Module, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { sign } from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { configurarAplicacaoHttp } from '../src/shared/http/configurar-aplicacao-http';
import { RelacaoChamadorInterno } from '../src/modules/rotas-internas/relacao-chamador-interno';
import { RotaInternaPost } from '../src/modules/rotas-internas/decorators/rota-interna-post.decorator';
import { RotaInternaGet } from '../src/modules/rotas-internas/decorators/rota-interna-get.decorator';

@Controller('internal')
class ProbeRotasInternasController {
  @Get('probe/sem-metadado')
  probeSemMetadado() {
    return { aberto: true };
  }
  @Post('probe/billing')
  @RotaInternaPost(RelacaoChamadorInterno.BILLING)
  probeBilling() {
    return { ok: true, chamador: 'BILLING' };
  }

  @Post('probe/execution')
  @RotaInternaPost(RelacaoChamadorInterno.EXECUTION)
  probeExecution() {
    return { ok: true, chamador: 'EXECUTION' };
  }

  @Get('probe/auth-cpf')
  @RotaInternaGet(RelacaoChamadorInterno.AUTH_CPF)
  probeAuthCpf(@Req() req: { headers: { authorization?: string } }) {
    return { ok: true, autorizado: Boolean(req.headers.authorization) };
  }
}

@Module({ controllers: [ProbeRotasInternasController] })
class ProbeRotasInternasModule {}

describe('Autenticação RS256 e rotas internas (e2e)', () => {
  let app: NestFastifyApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, ProbeRotasInternasModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configurarAplicacaoHttp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita HS256 no login/JWT público', async () => {
    const hs256 = sign(
      { sub: 'x', email: 'a@b.com', perfil: 'ADMINISTRADOR' },
      'segredo-hs256-apenas-teste',
      { algorithm: 'HS256' },
    );

    await request(app.getHttpServer())
      .get('/v1/clientes')
      .set('Authorization', `Bearer ${hs256}`)
      .expect(401);
  });

  it('isola token Billing vs Execution', async () => {
    const billing = process.env.TOKEN_BILLING_OS!;
    const execution = process.env.TOKEN_EXECUTION_OS!;

    await request(app.getHttpServer())
      .post('/internal/probe/billing')
      .set('Authorization', `Bearer ${billing}`)
      .set('Idempotency-Key', 'probe:1')
      .expect(201);

    await request(app.getHttpServer())
      .post('/internal/probe/billing')
      .set('Authorization', `Bearer ${execution}`)
      .set('Idempotency-Key', 'probe:1')
      .expect(401);
  });

  it('rejeita rota /internal sem metadado de chamador', async () => {
    await request(app.getHttpServer())
      .get('/internal/probe/sem-metadado')
      .expect(401);
  });

  it('aceita GET interno só com token auth-cpf', async () => {
    const tokenAuth = process.env.TOKEN_AUTH_CPF_OS!;
    await request(app.getHttpServer())
      .get('/internal/probe/auth-cpf')
      .set('Authorization', `Bearer ${tokenAuth}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/internal/probe/auth-cpf')
      .set('Authorization', `Bearer ${process.env.TOKEN_BILLING_OS}`)
      .expect(401);
  });

  it('rejeita JWT de usuário em rota interna', async () => {
    const jwtUsuario = await jwtService.signAsync({
      sub: 'u1',
      tipo: 'INTERNO',
      email: 'a@b.com',
      perfil: 'ADMINISTRADOR',
    });

    await request(app.getHttpServer())
      .post('/internal/probe/execution')
      .set('Authorization', `Bearer ${jwtUsuario}`)
      .set('Idempotency-Key', 'probe:2')
      .expect(401);
  });

  it('não publica /internal no documento Swagger gerado pela configuração do bootstrap', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const caminhos = Object.keys(resposta.body.paths);

    expect(caminhos.some((caminho) => caminho.startsWith('/internal'))).toBe(
      false,
    );
    expect(caminhos.some((caminho) => caminho.startsWith('/v1/'))).toBe(true);
  });

  it('a sonda interna existiria no Swagger sem a configuração do bootstrap', () => {
    const documentoSemFiltro = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );

    expect(Object.keys(documentoSemFiltro.paths)).toContain(
      '/internal/probe/billing',
    );
  });

  it('responde as rotas internas fora do prefixo /v1', async () => {
    const osId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const rotasInternas = [
      {
        metodo: 'post',
        caminho: `/internal/ordens-servico/${osId}/diagnostico`,
      },
      { metodo: 'post', caminho: `/internal/ordens-servico/${osId}/reservas` },
      { metodo: 'get', caminho: '/internal/clientes?cpf=12345678901' },
    ] as const;

    for (const { metodo, caminho } of rotasInternas) {
      // 401 sem token prova que a rota existe fora de /v1 e está protegida.
      await request(app.getHttpServer())[metodo](caminho).expect(401);
      await request(app.getHttpServer())[metodo](`/v1${caminho}`).expect(404);
    }
  });
});
