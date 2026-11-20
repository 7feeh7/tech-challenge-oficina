import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configurarAplicacaoHttp } from '../src/shared/http/configurar-aplicacao-http';
import { PerfilUsuario } from '../src/shared/generated/prisma/enums';
import { COMANDO_CONSULTAR_SITUACAO_FINANCEIRA } from '../src/shared/messaging/envelope';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';

/**
 * Acesso à consulta financeira administrativa (E30) pelo bootstrap real:
 * só `ADMINISTRADOR` solicita; os demais perfis e o cliente não geram efeito.
 */
describe('Consulta financeira administrativa: controle de acesso (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let ordemServicoId: string;
  let correlationId: string;

  const assinarToken = (claims: Record<string, unknown>) =>
    jwtService.signAsync(
      { sub: randomUUID(), ...claims },
      {
        privateKey: configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
        algorithm: 'RS256',
        issuer: configService.get<string>('JWT_ISSUER'),
        audience: configService.get<string>('JWT_AUDIENCE'),
      },
    );

  const assinarTokenInterno = (perfil: PerfilUsuario) =>
    assinarToken({ tipo: 'INTERNO', email: `${perfil}@oficina.test`, perfil });

  const solicitarConsulta = (token?: string) => {
    const requisicao = request(app.getHttpServer())
      .post(`/v1/ordens-servico/${ordemServicoId}/consulta-financeira`)
      .set('Idempotency-Key', randomUUID());
    return token
      ? requisicao.set('Authorization', `Bearer ${token}`)
      : requisicao;
  };

  const contarConsultasEmitidas = () =>
    prisma.outboxMensagem.count({
      where: {
        correlationId,
        eventType: COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
      },
    });

  beforeAll(async () => {
    exigirDatabaseUrl();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configurarAplicacaoHttp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);

    const cliente = await prisma.cliente.create({
      data: {
        nome: 'Cliente consulta financeira e2e',
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '8'),
        email: `consulta-financeira-${randomUUID()}@test.local`,
        telefone: '11988887777',
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
    correlationId = randomUUID();
    // Prazo vencido: a consulta de um administrador é emitida pela outbox.
    const ordem = await prisma.ordemServico.create({
      data: {
        correlationId,
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        status: 'AGUARDANDO_PAGAMENTO',
        prazoReferenciaReserva: new Date(Date.now() - 60_000),
      },
    });
    ordemServicoId = ordem.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('recusa sem token com 401, sem emitir consulta', async () => {
    await solicitarConsulta().expect(401);

    expect(await contarConsultasEmitidas()).toBe(0);
  });

  it.each([PerfilUsuario.ATENDENTE, PerfilUsuario.MECANICO])(
    'recusa o perfil %s com 403, sem emitir consulta',
    async (perfil) => {
      await solicitarConsulta(await assinarTokenInterno(perfil)).expect(403);

      expect(await contarConsultasEmitidas()).toBe(0);
    },
  );

  it('recusa o token de cliente com 403, sem emitir consulta', async () => {
    const tokenCliente = await assinarToken({
      tipo: 'CLIENTE',
      perfil: 'CLIENTE',
    });

    await solicitarConsulta(tokenCliente).expect(403);

    expect(await contarConsultasEmitidas()).toBe(0);
  });

  it('aceita o ADMINISTRADOR com 202 e emite a consulta', async () => {
    const resposta = await solicitarConsulta(
      await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR),
    ).expect(202);

    expect(resposta.body).toEqual({ resultado: 'emitida' });
    expect(await contarConsultasEmitidas()).toBe(1);
  });
});
