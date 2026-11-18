import { randomUUID } from 'node:crypto';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import {
  PerfilUsuario,
  SituacaoReconciliacaoConsumo,
  StatusOS,
  TipoPendenciaOs,
} from '../src/shared/generated/prisma/enums';
import {
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_INICIADO,
} from '../src/shared/messaging/envelope';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import {
  criarCatalogoSaga,
  criarPecaSaga,
  entregar,
  obterServicosSaga,
  pagamentoConfirmado,
  prepararAguardandoPagamento,
  statusDaOs,
  type CatalogoSaga,
  type OsEmAndamento,
  type ServicosSaga,
} from './helpers/jornada-saga-os';

/**
 * Ajuste administrativo por peça (D4.8, decisão de 2026-11-18): a pendência de
 * inventário só é resolvida quando toda peça divergente dela tem ajuste
 * registrado; a retomada da saga só acontece com a pendência resolvida.
 */
describe('Ajuste de estoque por peça divergente (e2e)', () => {
  let app: NestFastifyApplication;
  let servicos: ServicosSaga;
  let prisma: PrismaService;
  let catalogo: CatalogoSaga;

  const sufixo = Date.now();
  const adminEmail = `admin-ajuste-peca+${sufixo}@oficina.test`;
  const atendenteEmail = `atendente-ajuste-peca+${sufixo}@oficina.test`;
  const senha = 'senha-ajuste-peca';
  let tokenAdmin: string;
  let tokenAtendente: string;
  let adminId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    return res.body.token as string;
  };

  beforeAll(async () => {
    exigirDatabaseUrl();
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
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

    servicos = obterServicosSaga(app);
    prisma = servicos.prisma;
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    catalogo = await criarCatalogoSaga(prisma, 'ajuste-peca');

    const senhaHash = await bcrypt.hash(senha, 10);
    adminId = (
      await prisma.usuario.create({
        data: {
          nome: 'Admin ajuste por peça',
          email: adminEmail,
          senhaHash,
          perfil: PerfilUsuario.ADMINISTRADOR,
          ativo: true,
        },
      })
    ).id;
    await prisma.usuario.create({
      data: {
        nome: 'Atendente ajuste por peça',
        email: atendenteEmail,
        senhaHash,
        perfil: PerfilUsuario.ATENDENTE,
        ativo: true,
      },
    });
    tokenAdmin = await login(adminEmail);
    tokenAtendente = await login(atendenteEmail);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { in: [adminEmail, atendenteEmail] } },
    });
    await app.close();
  });

  /** Reparo concluído com consumo acima da reserva em duas peças: uma pendência com duas divergências. */
  const prepararDuasPecasDivergentes = async () => {
    const pecaA = await criarPecaSaga(prisma, 'ajuste-a', 10);
    const pecaB = await criarPecaSaga(prisma, 'ajuste-b', 10);
    const os: OsEmAndamento = await prepararAguardandoPagamento(
      servicos,
      catalogo,
      [
        { pecaId: pecaA, quantidade: 2 },
        { pecaId: pecaB, quantidade: 2 },
      ],
    );
    await pagamentoConfirmado(
      servicos,
      os,
      randomUUID(),
      `ORD-${randomUUID()}`,
    );
    await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
      tarefaId: `${os.osId}#1#REPARO`,
    });
    const divergente = (pecaId: string) => ({
      itemId: pecaId,
      tipo: 'CONSUMO_ACIMA',
      quantidadePrevista: 2,
      quantidadeUtilizada: 3,
      observacao: 'Consumo acima do autorizado.',
      justificativa: 'Peça adicional usada no reparo.',
    });
    await entregar(servicos, os, EVENTO_REPARO_CONCLUIDO, {
      responsavelId: 'mecanico-1',
      pecasUtilizadas: [
        { itemId: pecaA, quantidade: 3 },
        { itemId: pecaB, quantidade: 3 },
      ],
      servicosRealizados: [],
      divergencias: [divergente(pecaA), divergente(pecaB)],
    });
    const pendencia = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.osId,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const pecasDaPendencia = (
      pendencia.detalhes as { divergencias: { pecaId: string }[] }
    ).divergencias.map((d) => d.pecaId);
    expect(new Set(pecasDaPendencia)).toEqual(new Set([pecaA, pecaB]));
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);
    return { os, pecaA, pecaB, pendenciaId: pendencia.id };
  };

  const ajustar = (
    token: string,
    pendenciaId: string,
    pecaId: string,
    quantidadeFisicaNova: number,
    motivo = 'Contagem física da peça',
  ) =>
    request(app.getHttpServer())
      .post('/v1/reservas-estoque/ajustes-divergencia')
      .set('Authorization', `Bearer ${token}`)
      .send({ pendenciaId, pecaId, quantidadeFisicaNova, motivo });

  const pendencia = (id: string) =>
    prisma.pendenciaOs.findUniqueOrThrow({ where: { id } });

  it('mantém a pendência aberta com um ajuste parcial e a resolve, retomando a saga, quando a última peça é ajustada', async () => {
    const { os, pecaA, pecaB, pendenciaId } =
      await prepararDuasPecasDivergentes();

    await ajustar(tokenAdmin, pendenciaId, pecaA, 7).expect(204);

    expect((await pendencia(pendenciaId)).resolvida).toBe(false);
    expect(
      await prisma.ajusteEstoqueAdministrativo.findMany({
        where: { pendenciaId },
      }),
    ).toEqual([
      expect.objectContaining({
        pecaId: pecaA,
        quantidadeFisicaNova: 7,
        motivo: 'Contagem física da peça',
        responsavelId: adminId,
      }),
    ]);
    expect(
      (await prisma.peca.findUniqueOrThrow({ where: { id: pecaA } }))
        .quantidadeEstoque,
    ).toBe(7);
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);
    expect(
      (
        await prisma.consumoAplicadoOs.findFirstOrThrow({
          where: { ordemServicoId: os.osId },
        })
      ).situacaoReconciliacao,
    ).toBe(SituacaoReconciliacaoConsumo.DIVERGENCIA_PENDENTE);

    await ajustar(
      tokenAdmin,
      pendenciaId,
      pecaB,
      6,
      'Contagem da outra peça',
    ).expect(204);

    expect(await pendencia(pendenciaId)).toMatchObject({
      resolvida: true,
      resolvidaPorId: adminId,
    });
    const ajustes = await prisma.ajusteEstoqueAdministrativo.findMany({
      where: { pendenciaId },
    });
    expect(ajustes.map((a) => a.pecaId).sort()).toEqual([pecaA, pecaB].sort());
    expect(
      (
        await prisma.consumoAplicadoOs.findFirstOrThrow({
          where: { ordemServicoId: os.osId },
        })
      ).situacaoReconciliacao,
    ).toBe(SituacaoReconciliacaoConsumo.DIVERGENCIA_RESOLVIDA);
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
  });

  it('recusa o ajuste de quem não é ADMINISTRADOR sem registrar nada', async () => {
    const { pecaA, pendenciaId } = await prepararDuasPecasDivergentes();

    await ajustar(tokenAtendente, pendenciaId, pecaA, 7).expect(403);

    expect(
      await prisma.ajusteEstoqueAdministrativo.count({
        where: { pendenciaId },
      }),
    ).toBe(0);
    expect((await pendencia(pendenciaId)).resolvida).toBe(false);
  });

  it('ajustes concorrentes das duas peças resolvem a pendência uma única vez', async () => {
    const { os, pecaA, pecaB, pendenciaId } =
      await prepararDuasPecasDivergentes();

    const [primeiro, segundo] = await Promise.all([
      ajustar(tokenAdmin, pendenciaId, pecaA, 7),
      ajustar(tokenAdmin, pendenciaId, pecaB, 6),
    ]);

    expect([primeiro.status, segundo.status]).toEqual([204, 204]);
    expect((await pendencia(pendenciaId)).resolvida).toBe(true);
    expect(
      await prisma.ajusteEstoqueAdministrativo.count({
        where: { pendenciaId },
      }),
    ).toBe(2);
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
    expect(
      await prisma.historicoStatusOS.count({
        where: { ordemServicoId: os.osId, statusNovo: StatusOS.FINALIZADA },
      }),
    ).toBe(1);
  });

  it('não exige ajuste de peça fora do catálogo: a peça do catálogo resolve a pendência e a divergência da desconhecida fica registrada', async () => {
    const pecaA = await criarPecaSaga(prisma, 'ajuste-catalogo', 10);
    const pecaInexistente = randomUUID();
    const identificadorInvalido = 'peca-invalida';
    const os: OsEmAndamento = await prepararAguardandoPagamento(
      servicos,
      catalogo,
      [{ pecaId: pecaA, quantidade: 2 }],
    );
    await pagamentoConfirmado(
      servicos,
      os,
      randomUUID(),
      `ORD-${randomUUID()}`,
    );
    await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
      tarefaId: `${os.osId}#1#REPARO`,
    });
    await entregar(servicos, os, EVENTO_REPARO_CONCLUIDO, {
      responsavelId: 'mecanico-1',
      pecasUtilizadas: [
        { itemId: pecaA, quantidade: 3 },
        { itemId: pecaInexistente, quantidade: 1 },
        { itemId: identificadorInvalido, quantidade: 1 },
      ],
      servicosRealizados: [],
      divergencias: [],
    });
    const pendenciaAberta = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.osId,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    const pecasDivergentes = (
      pendenciaAberta.detalhes as { divergencias: { pecaId: string }[] }
    ).divergencias.map((d) => d.pecaId);
    expect(new Set(pecasDivergentes)).toEqual(
      new Set([pecaA, pecaInexistente, identificadorInvalido]),
    );
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);

    await ajustar(tokenAdmin, pendenciaAberta.id, pecaA, 7).expect(204);

    expect(await pendencia(pendenciaAberta.id)).toMatchObject({
      resolvida: true,
      resolvidaPorId: adminId,
    });
    expect(
      await prisma.ajusteEstoqueAdministrativo.count({
        where: { pendenciaId: pendenciaAberta.id },
      }),
    ).toBe(1);
    const aposResolucao = await pendencia(pendenciaAberta.id);
    const pecasRegistradas = (
      aposResolucao.detalhes as { divergencias: { pecaId: string }[] }
    ).divergencias.map((d) => d.pecaId);
    expect(pecasRegistradas).toContain(pecaInexistente);
    expect(pecasRegistradas).toContain(identificadorInvalido);
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
  });

  it('com pendência financeira do segundo pagamento aberta, o ajuste que resolve o inventário finaliza a OS e a pendência financeira continua visível', async () => {
    const pecaA = await criarPecaSaga(prisma, 'ajuste-financeira', 10);
    const os: OsEmAndamento = await prepararAguardandoPagamento(
      servicos,
      catalogo,
      [{ pecaId: pecaA, quantidade: 2 }],
    );
    const cobrancaId = randomUUID();
    await pagamentoConfirmado(servicos, os, cobrancaId, `ORD-${randomUUID()}`);
    await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
      tarefaId: `${os.osId}#1#REPARO`,
    });
    const outraOrder = `ORD-${randomUUID()}`;
    await pagamentoConfirmado(servicos, os, cobrancaId, outraOrder);
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);
    await entregar(servicos, os, EVENTO_REPARO_CONCLUIDO, {
      responsavelId: 'mecanico-1',
      pecasUtilizadas: [{ itemId: pecaA, quantidade: 3 }],
      servicosRealizados: [],
      divergencias: [
        {
          itemId: pecaA,
          tipo: 'CONSUMO_ACIMA',
          quantidadePrevista: 2,
          quantidadeUtilizada: 3,
          observacao: 'Consumo acima do autorizado.',
          justificativa: 'Peça adicional usada no reparo.',
        },
      ],
    });
    const pendenciaInventario = await prisma.pendenciaOs.findFirstOrThrow({
      where: {
        ordemServicoId: os.osId,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.EM_EXECUCAO);

    await ajustar(tokenAdmin, pendenciaInventario.id, pecaA, 7).expect(204);

    expect(await statusDaOs(prisma, os.osId)).toBe(StatusOS.FINALIZADA);
    expect(
      await prisma.historicoStatusOS.count({
        where: { ordemServicoId: os.osId, statusNovo: StatusOS.FINALIZADA },
      }),
    ).toBe(1);
    const financeiras = await prisma.pendenciaOs.findMany({
      where: {
        ordemServicoId: os.osId,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
      },
    });
    expect(financeiras).toHaveLength(1);
    expect(financeiras[0].detalhes).toMatchObject({
      natureza: 'SEGUNDO_PAGAMENTO',
      orderId: outraOrder,
      cobrancaId,
    });
  });
});
