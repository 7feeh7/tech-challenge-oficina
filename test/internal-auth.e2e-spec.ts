import {
  Controller,
  Get,
  Module,
  Post,
  Req,
  RequestMethod,
} from '@nestjs/common';
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
import { RelacaoChamadorInterno } from '../src/modules/rotas-internas/relacao-chamador-interno';
import { ChamadorInterno } from '../src/modules/rotas-internas/decorators/chamador-interno.decorator';
import { RotaInternaPost } from '../src/modules/rotas-internas/decorators/rota-interna-post.decorator';

@Controller('internal')
class ProbeRotasInternasController {
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
  @ChamadorInterno(RelacaoChamadorInterno.AUTH_CPF)
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
    app.setGlobalPrefix('v1', {
      exclude: [
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/ready', method: RequestMethod.ALL },
        { path: 'internal', method: RequestMethod.ALL },
        { path: 'internal/(.*)', method: RequestMethod.ALL },
      ],
    });
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

  it('omite /internal do Swagger público', () => {
    const config = new DocumentBuilder().setTitle('t').build();
    const document = SwaggerModule.createDocument(app, config);
    for (const path of Object.keys(document.paths)) {
      if (path.startsWith('/internal')) {
        delete document.paths[path];
      }
    }
    const paths = Object.keys(document.paths);
    expect(paths.some((p) => p.startsWith('/internal'))).toBe(false);
  });
});
