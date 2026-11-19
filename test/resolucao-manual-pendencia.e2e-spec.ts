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
import {
  PerfilUsuario,
  TipoPendenciaOs,
} from '../src/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';

const MOTIVO = 'Estorno conferido no painel do Billing';
const ESCOPO_RESOLUCAO = 'os.pendencia.resolucao_manual';

/**
 * Resolução manual de pendências pelo bootstrap real: controle de acesso,
 * validação do pedido, idempotência e os erros de negócio da rota.
 */
describe('Resolução manual de pendências (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let clienteId: string;
  let veiculoId: string;

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

  const assinarTokenInterno = (perfil: PerfilUsuario, sub = randomUUID()) =>
    assinarToken({
      sub,
      tipo: 'INTERNO',
      email: `${perfil}@oficina.test`,
      perfil,
    });

  const criarOs = async () =>
    (
      await prisma.ordemServico.create({
        data: {
          correlationId: randomUUID(),
          clienteId,
          veiculoId,
          status: 'CANCELADA',
        },
      })
    ).id;

  const abrirPendencia = async (
    detalhes: Record<string, unknown>,
    tipo: TipoPendenciaOs = TipoPendenciaOs.FINANCEIRA,
  ) => {
    const ordemServicoId = await criarOs();
    const pendencia = await prisma.pendenciaOs.create({
      data: { id: randomUUID(), ordemServicoId, rodada: 1, tipo, detalhes },
    });
    return { ordemServicoId, pendenciaId: pendencia.id };
  };

  const pagamentoTardioEstornado = () =>
    abrirPendencia({
      natureza: 'PAGAMENTO_TARDIO',
      tratamento: 'ESTORNO_AUTOMATICO',
      cobrancaId: randomUUID(),
    });

  const resolver = (
    ordemServicoId: string,
    pendenciaId: string,
    opcoes: {
      token?: string;
      chave?: string | null;
      corpo?: Record<string, unknown>;
    } = {},
  ) => {
    const { token, chave = randomUUID(), corpo = { motivo: MOTIVO } } = opcoes;
    let requisicao = request(app.getHttpServer()).post(
      `/v1/ordens-servico/${ordemServicoId}/pendencias/${pendenciaId}/resolucao-manual`,
    );
    if (token) {
      requisicao = requisicao.set('Authorization', `Bearer ${token}`);
    }
    if (chave) {
      requisicao = requisicao.set('Idempotency-Key', chave);
    }
    return requisicao.send(corpo);
  };

  const estadoDaPendencia = (id: string) =>
    prisma.pendenciaOs.findUniqueOrThrow({ where: { id } });

  const contarChave = (idempotencyKey: string) =>
    prisma.idempotencyRecord.count({
      where: { idempotencyKey, scope: ESCOPO_RESOLUCAO },
    });

  beforeAll(async () => {
    exigirDatabaseUrl();
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication<NestFastifyApplication>(
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
        nome: 'Cliente resolução manual e2e',
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '6'),
        email: `resolucao-manual-${randomUUID()}@test.local`,
        telefone: '11988887777',
      },
    });
    clienteId = cliente.id;
    veiculoId = (
      await prisma.veiculo.create({
        data: {
          clienteId,
          placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
          marca: 'M',
          modelo: 'M',
          ano: 2024,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('autenticação e autorização', () => {
    it('recusa sem token com 401, sem alterar a pendência', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();

      await resolver(ordemServicoId, pendenciaId).expect(401);

      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
    });

    it.each([PerfilUsuario.ATENDENTE, PerfilUsuario.MECANICO])(
      'recusa o perfil %s com 403, sem alterar a pendência',
      async (perfil) => {
        const { ordemServicoId, pendenciaId } =
          await pagamentoTardioEstornado();

        await resolver(ordemServicoId, pendenciaId, {
          token: await assinarTokenInterno(perfil),
        }).expect(403);

        expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
      },
    );

    it('recusa o token de cliente com 403, sem alterar a pendência', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();
      const tokenCliente = await assinarToken({
        tipo: 'CLIENTE',
        perfil: 'CLIENTE',
      });

      await resolver(ordemServicoId, pendenciaId, {
        token: tokenCliente,
      }).expect(403);

      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
    });
  });

  describe('validação do pedido (400)', () => {
    let tokenAdmin: string;

    beforeAll(async () => {
      tokenAdmin = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);
    });

    it('recusa sem Idempotency-Key', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();

      await resolver(ordemServicoId, pendenciaId, {
        token: tokenAdmin,
        chave: null,
      }).expect(400);

      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
    });

    it.each([
      ['sem o motivo', {}],
      ['com o motivo vazio', { motivo: '' }],
      ['com o motivo só de espaços', { motivo: '    ' }],
      ['com o motivo acima do tamanho máximo', { motivo: 'a'.repeat(501) }],
      ['com o motivo que não é texto', { motivo: 123 }],
      [
        'com campo desconhecido',
        { motivo: MOTIVO, responsavelId: randomUUID() },
      ],
    ])('recusa o corpo %s', async (_descricao, corpo) => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();
      const chave = randomUUID();

      await resolver(ordemServicoId, pendenciaId, {
        token: tokenAdmin,
        chave,
        corpo,
      }).expect(400);

      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
      expect(await contarChave(chave)).toBe(0);
    });

    it('recusa ids que não são UUID', async () => {
      await resolver('nao-e-uuid', randomUUID(), { token: tokenAdmin }).expect(
        400,
      );
      await resolver(randomUUID(), 'nao-e-uuid', { token: tokenAdmin }).expect(
        400,
      );
    });

    it('aceita o reenvio corrigido com a mesma chave, porque o 4xx não grava a chave', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();
      const chave = randomUUID();
      await resolver(ordemServicoId, pendenciaId, {
        token: tokenAdmin,
        chave,
        corpo: { motivo: '' },
      }).expect(400);

      await resolver(ordemServicoId, pendenciaId, {
        token: tokenAdmin,
        chave,
      }).expect(204);

      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(true);
    });
  });

  describe('resolução e erros de negócio', () => {
    it('resolve com 204 gravando o responsável do token, o motivo aparado e o relógio do banco', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();
      const sub = randomUUID();
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR, sub);

      const resposta = await resolver(ordemServicoId, pendenciaId, {
        token,
        corpo: { motivo: `   ${MOTIVO}   ` },
      }).expect(204);

      expect(resposta.text).toBe('');
      const resolvida = await estadoDaPendencia(pendenciaId);
      expect(resolvida).toMatchObject({
        resolvida: true,
        resolvidaPorId: sub,
      });
      expect(resolvida.resolvidaEm).toBeInstanceOf(Date);
      expect(resolvida.detalhes).toMatchObject({
        natureza: 'PAGAMENTO_TARDIO',
        tratamento: 'ESTORNO_AUTOMATICO',
        resolucaoManual: {
          motivo: MOTIVO,
          responsavelId: sub,
          resolvidaEm: resolvida.resolvidaEm!.toISOString(),
          caso: 'PAGAMENTO_TARDIO_ESTORNADO_AUTOMATICAMENTE',
        },
      });
    });

    it('repete a resposta 204 com a mesma chave e o mesmo corpo, sem novo efeito', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);
      const chave = randomUUID();
      await resolver(ordemServicoId, pendenciaId, { token, chave }).expect(204);
      const resolvida = await estadoDaPendencia(pendenciaId);

      await resolver(ordemServicoId, pendenciaId, { token, chave }).expect(204);

      expect(await estadoDaPendencia(pendenciaId)).toEqual(resolvida);
      expect(await contarChave(chave)).toBe(1);
    });

    it('responde 409 CONTEUDO_DIVERGENTE com a mesma chave e outro motivo', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);
      const chave = randomUUID();
      await resolver(ordemServicoId, pendenciaId, { token, chave }).expect(204);

      const resposta = await resolver(ordemServicoId, pendenciaId, {
        token,
        chave,
        corpo: { motivo: 'Outro motivo' },
      }).expect(409);

      expect(resposta.body.codigo).toBe('CONTEUDO_DIVERGENTE');
    });

    it('responde 409 para pendência já resolvida com outra chave', async () => {
      const { ordemServicoId, pendenciaId } = await pagamentoTardioEstornado();
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);
      await resolver(ordemServicoId, pendenciaId, { token }).expect(204);

      const resposta = await resolver(ordemServicoId, pendenciaId, {
        token,
      }).expect(409);

      expect(resposta.body.codigo).toBe('PENDENCIA_NAO_ELEGIVEL');
    });

    it('responde 409 PENDENCIA_NAO_ELEGIVEL para pendência fora dos três casos, sem alterá-la', async () => {
      const { ordemServicoId, pendenciaId } = await abrirPendencia({
        cobrancaId: randomUUID(),
        motivo: 'Pagamento após encerramento',
      });
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);
      const chave = randomUUID();

      const resposta = await resolver(ordemServicoId, pendenciaId, {
        token,
        chave,
      }).expect(409);

      expect(resposta.body.codigo).toBe('PENDENCIA_NAO_ELEGIVEL');
      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
      expect(await contarChave(chave)).toBe(0);
    });

    it('responde 409 EVIDENCIA_BILLING_AUSENTE para segundo pagamento sem o estorno do Billing', async () => {
      const { ordemServicoId, pendenciaId } = await abrirPendencia({
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: 'ORD-2',
        cobrancaId: randomUUID(),
      });
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);

      const resposta = await resolver(ordemServicoId, pendenciaId, {
        token,
      }).expect(409);

      expect(resposta.body.codigo).toBe('EVIDENCIA_BILLING_AUSENTE');
      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
    });

    it('resolve o segundo pagamento com a evidência do estorno integral', async () => {
      const { ordemServicoId, pendenciaId } = await abrirPendencia({
        natureza: 'SEGUNDO_PAGAMENTO',
        orderId: 'ORD-2',
        evidenciaEstornoBilling: {
          eventId: randomUUID(),
          orderId: 'ORD-2',
          tipoEstorno: 'INTEGRAL',
        },
      });
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);

      await resolver(ordemServicoId, pendenciaId, { token }).expect(204);

      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(true);
    });

    it('responde 404 para pendência inexistente, de outra OS e para OS inexistente', async () => {
      const token = await assinarTokenInterno(PerfilUsuario.ADMINISTRADOR);
      const { pendenciaId } = await pagamentoTardioEstornado();
      const outraOs = await criarOs();

      await resolver(outraOs, randomUUID(), { token }).expect(404);
      await resolver(outraOs, pendenciaId, { token }).expect(404);
      await resolver(randomUUID(), pendenciaId, { token }).expect(404);

      expect((await estadoDaPendencia(pendenciaId)).resolvida).toBe(false);
    });
  });
});
