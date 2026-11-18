import { randomUUID } from 'node:crypto';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CriarOrdemServicoUseCase } from '../src/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { TransicaoOrdemServicoService } from '../src/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { PrismaService } from '../src/shared/database/prisma.service';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../src/shared/database/unit-of-work.port';
import { StatusOS } from '../src/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';

/**
 * Rotas internas pela pilha HTTP real: status 200 de 03 (que Billing e
 * Execution exigem) e o `tarefaId` no formato enviado pelo Execution.
 */
describe('Rotas internas do OS pela pilha HTTP (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let unitOfWork: UnitOfWork;
  let transicoes: TransicaoOrdemServicoService;
  let criarOs: CriarOrdemServicoUseCase;

  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let pecaId: string;
  let servicoId: string;

  const tokenExecution = () => `Bearer ${process.env.TOKEN_EXECUTION_OS}`;
  const tokenBilling = () => `Bearer ${process.env.TOKEN_BILLING_OS}`;

  beforeAll(async () => {
    exigirDatabaseUrl();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    unitOfWork = app.get(UNIT_OF_WORK, { strict: false });
    transicoes = app.get(TransicaoOrdemServicoService, { strict: false });
    criarOs = app.get(CriarOrdemServicoUseCase, { strict: false });

    clienteId = (
      await prisma.cliente.create({
        data: {
          nome: `Cliente ${sufixo}`,
          cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '5'),
          email: `http-interno-${sufixo}@test.local`,
          telefone: '11999990000',
        },
      })
    ).id;
    veiculoId = (
      await prisma.veiculo.create({
        data: {
          placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
          marca: 'Test',
          modelo: 'Modelo',
          ano: 2024,
          clienteId,
        },
      })
    ).id;
    pecaId = (
      await prisma.peca.create({
        data: {
          codigo: `HTTP-${sufixo}`,
          nome: 'Peça http',
          precoUnitario: 25,
          quantidadeEstoque: 50,
        },
      })
    ).id;
    servicoId = (
      await prisma.servico.create({
        data: { nome: `Srv ${sufixo}`, precoBase: 40, tempoEstimadoMin: 30 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function abrirOsEmDiagnostico(): Promise<string> {
    const os = await criarOs.execute({
      clienteId,
      veiculoId,
      descricaoProblema: 'teste http',
      pecas: [{ pecaId, quantidade: 1 }],
    });
    await unitOfWork.executar((contexto) =>
      transicoes.aplicar(contexto, {
        ordemServicoId: os.id,
        aplicar: (ordem, agora) => ordem.registrarDiagnosticoIniciado(agora),
        observacao: 'teste http',
      }),
    );
    return os.id;
  }

  const diagnostico = (
    osId: string,
    chave: string,
    corpo: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      .post(`/internal/ordens-servico/${osId}/diagnostico`)
      .set('Authorization', tokenExecution())
      .set('Idempotency-Key', chave)
      .send(corpo);

  it('conclui o diagnóstico com 200 e tarefaId <osId>#<rodada>#DIAGNOSTICO, idempotente por diagnostico:<tarefaId>', async () => {
    const osId = await abrirOsEmDiagnostico();
    const tarefaId = `${osId}#1#DIAGNOSTICO`;
    const chave = `diagnostico:${tarefaId}`;
    const corpo = {
      rodada: 1,
      tarefaId,
      laudo: 'Pastilhas gastas',
      itens: [
        { tipo: 'PECA', itemId: pecaId, quantidade: 2 },
        { tipo: 'SERVICO', itemId: servicoId, quantidade: 1 },
      ],
    };

    const primeira = await diagnostico(osId, chave, corpo).expect(200);
    expect(primeira.body.rodada).toBe(1);
    expect(primeira.body.itensOficiais).toHaveLength(2);

    const repeticao = await diagnostico(osId, chave, corpo).expect(200);
    expect(repeticao.body).toEqual(primeira.body);

    const gravados = await prisma.idempotencyRecord.count({
      where: { idempotencyKey: chave, scope: 'internal.diagnostico' },
    });
    expect(gravados).toBe(1);

    const divergente = await diagnostico(osId, chave, {
      ...corpo,
      laudo: 'Outro laudo',
    }).expect(409);
    expect(divergente.body.codigo).toBe('CONTEUDO_DIVERGENTE');
  });

  it.each([
    ['texto livre', 'qualquer-coisa'],
    ['sufixo de tipo errado', `${randomUUID()}#1#REPARO`],
    ['rodada zero', `${randomUUID()}#0#DIAGNOSTICO`],
    ['rodada não numérica', `${randomUUID()}#x#DIAGNOSTICO`],
    ['osId que não é UUID', '123#1#DIAGNOSTICO'],
    ['lixo depois do sufixo', `${randomUUID()}#1#DIAGNOSTICO#extra`],
    ['lixo antes do UUID', `x${randomUUID()}#1#DIAGNOSTICO`],
  ])('recusa tarefaId inválido com 400 (%s)', async (_nome, tarefaId) => {
    const osId = await abrirOsEmDiagnostico();
    await diagnostico(osId, `diagnostico:${tarefaId}`, {
      rodada: 1,
      tarefaId,
      laudo: 'Laudo',
      itens: [{ tipo: 'SERVICO', itemId: servicoId, quantidade: 1 }],
    }).expect(400);

    const os = await prisma.ordemServico.findUniqueOrThrow({
      where: { id: osId },
    });
    expect(os.status).toBe(StatusOS.EM_DIAGNOSTICO);
  });

  it('reserva o estoque com 200 e devolve reservaId e prazoReferencia', async () => {
    const osId = await abrirOsEmDiagnostico();
    await diagnostico(osId, `diagnostico:${osId}#1#DIAGNOSTICO`, {
      rodada: 1,
      tarefaId: `${osId}#1#DIAGNOSTICO`,
      laudo: 'Laudo',
      itens: [{ tipo: 'PECA', itemId: pecaId, quantidade: 1 }],
    }).expect(200);
    await unitOfWork.executar((contexto) =>
      transicoes.aplicar(contexto, {
        ordemServicoId: osId,
        aplicar: (ordem, agora) => ordem.registrarOrcamentoGerado(agora),
        observacao: 'orçamento',
      }),
    );

    const orcamentoId = randomUUID();
    const chave = `reserva:${orcamentoId}:1`;
    const enviar = () =>
      request(app.getHttpServer())
        .post(`/internal/ordens-servico/${osId}/reservas`)
        .set('Authorization', tokenBilling())
        .set('Idempotency-Key', chave)
        .send({ rodada: 1, orcamentoId });

    const primeira = await enviar().expect(200);
    expect(primeira.body.reservaId).toEqual(expect.any(String));
    expect(new Date(primeira.body.prazoReferencia).toString()).not.toBe(
      'Invalid Date',
    );

    const repeticao = await enviar().expect(200);
    expect(repeticao.body).toEqual(primeira.body);
  });
});
