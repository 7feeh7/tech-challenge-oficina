import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { StatusOS } from '@/shared/generated/prisma/enums';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import type { MetricsService } from '@/shared/observability/metrics.service';
import { METRIC_NAMES } from '@/shared/observability/observability.config';
import { OsMetricsService } from '@/shared/observability/os-metrics.service';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

// As datas ficam décadas no passado para as OS do teste serem as mais antigas do
// banco compartilhado com as demais suítes de integração.
const TOLERANCIA_SEGUNDOS = 120;

describe('Idade da OS mais antiga por status (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let osMetrics: OsMetricsService;
  const gauges = new Map<string, number>();
  const ordemServicoIds: string[] = [];
  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;

  const metricsFake = {
    gauge: (metric: string, value: number, tags: string[] = []) => {
      if (metric === METRIC_NAMES.osIdadeMaisAntigaSegundos) {
        gauges.set(tags[0], value);
      }
    },
  } as unknown as MetricsService;

  const segundosDesde = (data: Date) => (Date.now() - data.getTime()) / 1000;

  async function criarOrdemServico(
    status: StatusOS,
    criadoEm: Date,
    entradasNoStatus: Date[],
  ): Promise<void> {
    const ordemServico = await prisma.ordemServico.create({
      data: {
        status,
        correlationId: randomUUID(),
        clienteId,
        veiculoId,
        criadoEm,
        historicoStatus: {
          create: entradasNoStatus.map((ocorridoEm) => ({
            statusNovo: status,
            ocorridoEm,
          })),
        },
      },
    });
    ordemServicoIds.push(ordemServico.id);
  }

  beforeAll(async () => {
    exigirDatabaseUrl();

    nestModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
    }).compile();

    prisma = nestModule.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);
    osMetrics = new OsMetricsService(metricsFake, prisma);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente idade ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '5'),
        email: `idade-${sufixo}@test.local`,
        telefone: '11966665555',
      },
    });
    clienteId = cliente.id;
    const veiculo = await prisma.veiculo.create({
      data: {
        clienteId,
        placa: `I${sufixo.slice(0, 6).toUpperCase()}`,
        modelo: 'Teste',
        marca: 'Marca',
        ano: 2022,
      },
    });
    veiculoId = veiculo.id;

    // Uma só entrada no status.
    await criarOrdemServico(
      StatusOS.EM_CANCELAMENTO,
      new Date('1999-12-31T00:00:00.000Z'),
      [new Date('2000-01-01T00:00:00.000Z')],
    );
    // Reentrada no mesmo status (outra rodada): vale a última entrada de cada
    // OS, e a OS mais antiga é a de menor última entrada (2002, não 2001).
    await criarOrdemServico(
      StatusOS.EM_EXECUCAO,
      new Date('1999-12-31T00:00:00.000Z'),
      [
        new Date('2001-01-01T00:00:00.000Z'),
        new Date('2003-01-01T00:00:00.000Z'),
      ],
    );
    await criarOrdemServico(
      StatusOS.EM_EXECUCAO,
      new Date('1999-12-31T00:00:00.000Z'),
      [new Date('2002-01-01T00:00:00.000Z')],
    );
    // Sem histórico: usa a criação da OS.
    await criarOrdemServico(
      StatusOS.AGUARDANDO_PAGAMENTO,
      new Date('1999-06-01T00:00:00.000Z'),
      [],
    );
    // Fora de STATUS_COM_DURACAO: não gera gauge.
    await criarOrdemServico(
      StatusOS.CANCELADA,
      new Date('1990-01-01T00:00:00.000Z'),
      [new Date('1990-01-02T00:00:00.000Z')],
    );

    await osMetrics.recordIdadeMaisAntigaPorStatus();
  });

  afterAll(async () => {
    await prisma?.ordemServico.deleteMany({
      where: { id: { in: ordemServicoIds } },
    });
    await prisma?.veiculo.delete({ where: { id: veiculoId } });
    await prisma?.cliente.delete({ where: { id: clienteId } });
    await fecharModuloIntegracao(nestModule);
  });

  const expectIdadeProxima = (status: string, entrouEm: Date) => {
    const esperado = segundosDesde(entrouEm);

    expect(
      Math.abs((gauges.get(`status:${status}`) ?? 0) - esperado),
    ).toBeLessThan(TOLERANCIA_SEGUNDOS);
  };

  it('usa a única entrada da OS no status', () => {
    expectIdadeProxima('EM_CANCELAMENTO', new Date('2000-01-01T00:00:00.000Z'));
  });

  it('usa a última entrada de cada OS e a menor entre as OS do status', () => {
    expectIdadeProxima('EM_EXECUCAO', new Date('2002-01-01T00:00:00.000Z'));
  });

  it('usa a criação da OS quando falta histórico do status', () => {
    expectIdadeProxima(
      'AGUARDANDO_PAGAMENTO',
      new Date('1999-06-01T00:00:00.000Z'),
    );
  });

  it('emite um gauge por status de duração e nenhum para status terminal', () => {
    expect([...gauges.keys()].sort()).toEqual(
      [
        'status:AGUARDANDO_APROVACAO',
        'status:AGUARDANDO_EXECUCAO',
        'status:AGUARDANDO_PAGAMENTO',
        'status:EM_CANCELAMENTO',
        'status:EM_DIAGNOSTICO',
        'status:EM_EXECUCAO',
        'status:FINALIZADA',
      ].sort(),
    );
  });
});
