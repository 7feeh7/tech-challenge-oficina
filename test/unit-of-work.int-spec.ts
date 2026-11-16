import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ContextoTransacaoInvalidoError } from '../src/shared/database/contexto-transacao-invalido.error';
import { obterClienteTransacao } from '../src/shared/database/obter-cliente-transacao';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { PrismaUnitOfWork } from '../src/shared/database/prisma-unit-of-work';
import type { ContextoTransacao } from '../src/shared/database/unit-of-work.port';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

class GatewayPecaIntegracao {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    contexto: ContextoTransacao,
    dados: {
      codigo: string;
      nome: string;
      precoUnitario: number;
      quantidadeEstoque: number;
    },
  ): Promise<string> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const criada = await cliente.peca.create({ data: dados });
    return criada.id;
  }
}

class GatewayServicoIntegracao {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    contexto: ContextoTransacao,
    dados: {
      nome: string;
      precoBase: number;
      tempoEstimadoMin: number;
    },
  ): Promise<string> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const criado = await cliente.servico.create({ data: dados });
    return criado.id;
  }
}

describe('Unit of Work (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let uow: PrismaUnitOfWork;
  let pecas: GatewayPecaIntegracao;
  let servicos: GatewayServicoIntegracao;

  const sufixo = `${Date.now()}`;

  beforeAll(async () => {
    exigirDatabaseUrl();

    nestModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
    }).compile();

    prisma = nestModule.get(PrismaService);
    uow = nestModule.get(PrismaUnitOfWork);
    pecas = new GatewayPecaIntegracao(prisma);
    servicos = new GatewayServicoIntegracao(prisma);

    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  beforeEach(async () => {
    await prisma.movimentacaoEstoque.deleteMany({
      where: { peca: { codigo: { contains: sufixo } } },
    });
    await prisma.peca.deleteMany({
      where: { codigo: { contains: sufixo } },
    });
    await prisma.servico.deleteMany({
      where: { nome: { contains: sufixo } },
    });
  });

  it('compartilha transação entre dois gateways e confirma commit', async () => {
    await uow.executar(async (contexto) => {
      await pecas.registrar(contexto, {
        codigo: `PEC-${sufixo}`,
        nome: `Peça integração ${sufixo}`,
        precoUnitario: 10,
        quantidadeEstoque: 5,
      });
      await servicos.registrar(contexto, {
        nome: `Serviço integração ${sufixo}`,
        precoBase: 20,
        tempoEstimadoMin: 30,
      });
    });

    expect(
      await prisma.peca.count({ where: { codigo: { contains: sufixo } } }),
    ).toBe(1);
    expect(
      await prisma.servico.count({ where: { nome: { contains: sufixo } } }),
    ).toBe(1);
  });

  it('desfaz tudo quando o segundo gateway falha na mesma unidade', async () => {
    await expect(
      uow.executar(async (contexto) => {
        await pecas.registrar(contexto, {
          codigo: `PEC-ROLL-${sufixo}`,
          nome: `Peça rollback ${sufixo}`,
          precoUnitario: 10,
          quantidadeEstoque: 5,
        });
        throw new Error('força rollback');
      }),
    ).rejects.toThrow('força rollback');

    expect(
      await prisma.peca.count({ where: { codigo: { contains: sufixo } } }),
    ).toBe(0);
  });

  it('rejeita contexto inválido em obterClienteTransacao', () => {
    const config = nestModule.get(ConfigService);
    const uowManual = new PrismaUnitOfWork(prisma, config);
    const contextoFalso = {} as ContextoTransacao;

    expect(() => obterClienteTransacao(contextoFalso, prisma)).toThrow(
      ContextoTransacaoInvalidoError,
    );

    expect(uowManual).toBeDefined();
  });
});
