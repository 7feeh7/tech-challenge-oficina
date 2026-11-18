import { randomUUID } from 'node:crypto';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ProcessadorPrazoReferenciaService } from '@/modules/coordenacao-saga/infra/jobs/processador-prazo-referencia.service';
import { PrismaService } from '@/shared/database/prisma.service';
import { PerfilUsuario, StatusOS } from '@/shared/generated/prisma/enums';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from '../../helpers/exigir-database-integracao';

const SENHA_DE_TESTE = 'senha-bdd-123';

export interface Catalogo {
  clienteId: string;
  veiculoId: string;
  servicoId: string;
}

/**
 * Aplicação completa (HTTP, guards, SQS e outbox pelas portas) sobre o
 * PostgreSQL local. Billing e Execution não existem aqui: quem fala por eles
 * são os serviços simulados, que só usam as portas do OS.
 */
export class AmbienteBdd {
  private readonly usuariosCriados: string[] = [];

  private constructor(
    readonly app: NestFastifyApplication,
    readonly prisma: PrismaService,
    readonly processar: ProcessarMensagemEntradaService,
    readonly verificadorDePrazo: ProcessadorPrazoReferenciaService,
    readonly concluirDiagnosticoNoOs: ConcluirDiagnosticoInternoUseCase,
    private readonly tokenAtendente: string,
    private readonly tokenAdministrador: string,
    readonly administradorId: string,
  ) {}

  static async criar(): Promise<AmbienteBdd> {
    exigirDatabaseUrl();
    process.env.OUTBOX_PUBLISHER_HABILITADO = 'false';
    process.env.SQS_CONSUMER_HABILITADO = 'false';
    process.env.PRAZO_REFERENCIA_VERIFICADOR_HABILITADO = 'false';

    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = modulo.createNestApplication<NestFastifyApplication>(
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

    const prisma = app.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);

    const sufixo = randomUUID().slice(0, 8);
    const senhaHash = await bcrypt.hash(SENHA_DE_TESTE, 10);
    const administrador = await prisma.usuario.create({
      data: {
        nome: 'Administrador BDD',
        email: `admin-bdd-${sufixo}@oficina.test`,
        senhaHash,
        perfil: PerfilUsuario.ADMINISTRADOR,
        ativo: true,
      },
    });
    const atendente = await prisma.usuario.create({
      data: {
        nome: 'Atendente BDD',
        email: `atendente-bdd-${sufixo}@oficina.test`,
        senhaHash,
        perfil: PerfilUsuario.ATENDENTE,
        ativo: true,
      },
    });
    const entrar = async (email: string) => {
      const resposta = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, senha: SENHA_DE_TESTE })
        .expect(200);
      return (resposta.body as { token: string }).token;
    };

    const ambiente = new AmbienteBdd(
      app,
      prisma,
      app.get(ProcessarMensagemEntradaService),
      app.get(ProcessadorPrazoReferenciaService),
      app.get(ConcluirDiagnosticoInternoUseCase),
      await entrar(atendente.email),
      await entrar(administrador.email),
      administrador.id,
    );
    ambiente.usuariosCriados.push(administrador.id, atendente.id);
    return ambiente;
  }

  async encerrar(): Promise<void> {
    await this.prisma.usuario.deleteMany({
      where: { id: { in: this.usuariosCriados } },
    });
    await this.app.close();
  }

  async criarCatalogo(): Promise<Catalogo> {
    const sufixo = randomUUID().slice(0, 8);
    const cliente = await this.prisma.cliente.create({
      data: {
        nome: `Cliente BDD ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '5'),
        email: `cliente-bdd-${sufixo}@test.local`,
        telefone: '11988887777',
      },
    });
    const veiculo = await this.prisma.veiculo.create({
      data: {
        clienteId: cliente.id,
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
        modelo: 'Sedan',
        marca: 'Marca',
        ano: 2020,
      },
    });
    const servico = await this.prisma.servico.create({
      data: {
        nome: `Troca de pastilhas ${sufixo}`,
        descricao: 'Serviço de teste',
        precoBase: 120,
        tempoEstimadoMin: 30,
      },
    });
    return {
      clienteId: cliente.id,
      veiculoId: veiculo.id,
      servicoId: servico.id,
    };
  }

  async criarPeca(
    nome: string,
    precoUnitario: number,
    quantidadeEstoque: number,
  ): Promise<{ id: string; nome: string }> {
    const peca = await this.prisma.peca.create({
      data: {
        codigo: `BDD-${randomUUID().slice(0, 10)}`,
        nome,
        precoUnitario,
        quantidadeEstoque,
      },
    });
    return { id: peca.id, nome };
  }

  /**
   * Faz o prazo de referência da reserva vencer e deixa só esta ordem elegível
   * ao verificador periódico, porque o banco de integração é compartilhado com
   * outras suítes que também deixam ordens aguardando pagamento.
   */
  async vencerPrazoDeReferencia(ordemServicoId: string): Promise<void> {
    await this.prisma.ordemServico.updateMany({
      where: {
        status: StatusOS.AGUARDANDO_PAGAMENTO,
        id: { not: ordemServicoId },
        prazoReferenciaReserva: { not: null },
      },
      data: { consultaPrazoReivindicadoEm: new Date(Date.now() + 3_600_000) },
    });
    await this.prisma.ordemServico.update({
      where: { id: ordemServicoId },
      data: {
        prazoReferenciaReserva: new Date(Date.now() - 60_000),
        consultaPrazoProximaEm: null,
        consultaPrazoReivindicadoEm: null,
      },
    });
  }

  atendente() {
    return {
      post: (caminho: string) =>
        request(this.app.getHttpServer())
          .post(caminho)
          .set('Authorization', `Bearer ${this.tokenAtendente}`)
          .set('Idempotency-Key', randomUUID()),
      get: (caminho: string) =>
        request(this.app.getHttpServer())
          .get(caminho)
          .set('Authorization', `Bearer ${this.tokenAtendente}`),
    };
  }

  administrador() {
    return {
      post: (caminho: string) =>
        request(this.app.getHttpServer())
          .post(caminho)
          .set('Authorization', `Bearer ${this.tokenAdministrador}`)
          .set('Idempotency-Key', randomUUID()),
    };
  }

  /** Porta HTTP interna do OS usada pelo Billing, com o token e os cabeçalhos que ele envia. */
  comoBilling(
    caminho: string,
    chaveIdempotencia: string,
    correlationId: string,
  ) {
    return request(this.app.getHttpServer())
      .post(caminho)
      .set('Authorization', `Bearer ${process.env.TOKEN_BILLING_OS}`)
      .set('X-Correlation-Id', correlationId)
      .set('X-Request-Id', randomUUID())
      .set('Idempotency-Key', chaveIdempotencia);
  }
}
