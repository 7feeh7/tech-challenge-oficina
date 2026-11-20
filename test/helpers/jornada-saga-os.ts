import { randomUUID } from 'node:crypto';
import type { Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { CoordenacaoSagaModule } from '@/modules/coordenacao-saga/coordenacao-saga.module';
import { RegistrarDesistenciaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-desistencia.use-case';
import { BuscarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/buscar-ordem-servico.use-case';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { AjustarEstoqueDivergenciaUseCase } from '@/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';
import { ReservasEstoqueModule } from '@/modules/reservas-estoque/reservas-estoque.module';
import { ConcluirDiagnosticoInternoUseCase } from '@/modules/rotas-internas/application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '@/modules/rotas-internas/application/use-cases/reservar-os-interno.use-case';
import { RotasInternasModule } from '@/modules/rotas-internas/rotas-internas.module';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import { IdempotencyModule } from '@/shared/idempotency/idempotency.module';
import {
  EVENTO_COBRANCA_CRIADA,
  EVENTO_DIAGNOSTICO_INICIADO,
  EVENTO_ORCAMENTO_GERADO,
  EVENTO_PAGAMENTO_CONFIRMADO,
  EVENTO_REPARO_CONCLUIDO,
  EVENTO_REPARO_INICIADO,
} from '@/shared/messaging/envelope';
import { ProcessarMensagemEntradaService } from '@/shared/messaging/application/services/processar-mensagem-entrada.service';
import { MensageriaModule } from '@/shared/messaging/mensageria.module';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { montarEnvelopeE42 } from './e42-envelope';
import { carregarExemplo } from './exemplos-contrato';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './exigir-database-integracao';

export interface ProvedorDeServicos {
  get<T>(tipo: Type<T>, opcoes?: { strict: boolean }): T;
}

export interface ServicosSaga {
  prisma: PrismaService;
  criarOs: CriarOrdemServicoUseCase;
  concluirDiagnostico: ConcluirDiagnosticoInternoUseCase;
  reservar: ReservarOsInternoUseCase;
  processar: ProcessarMensagemEntradaService;
  desistir: RegistrarDesistenciaUseCase;
  buscar: BuscarOrdemServicoUseCase;
  ajustarInventario: AjustarEstoqueDivergenciaUseCase;
}

export interface CatalogoSaga {
  clienteId: string;
  veiculoId: string;
  servicoId: string;
}

export interface OsEmAndamento {
  osId: string;
  correlationId: string;
}

/** Módulos mínimos da saga sobre PostgreSQL real, sem filas nem publicadores. */
export async function criarModuloSaga(): Promise<TestingModule> {
  exigirDatabaseUrl();
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            OUTBOX_PUBLISHER_HABILITADO: 'false',
            SQS_CONSUMER_HABILITADO: 'false',
          }),
        ],
      }),
      ObservabilityModule,
      IdempotencyModule,
      PrismaModule,
      MensageriaModule,
      CoordenacaoSagaModule,
      OrdensServicoModule,
      ReservasEstoqueModule,
      RotasInternasModule,
    ],
  }).compile();
  await verificarConexaoPostgres(
    () => modulo.get(PrismaService).$queryRaw`SELECT 1`,
  );
  return modulo;
}

export function obterServicosSaga(modulo: ProvedorDeServicos): ServicosSaga {
  const opcoes = { strict: false };
  return {
    prisma: modulo.get(PrismaService, opcoes),
    criarOs: modulo.get(CriarOrdemServicoUseCase, opcoes),
    concluirDiagnostico: modulo.get(ConcluirDiagnosticoInternoUseCase, opcoes),
    reservar: modulo.get(ReservarOsInternoUseCase, opcoes),
    processar: modulo.get(ProcessarMensagemEntradaService, opcoes),
    desistir: modulo.get(RegistrarDesistenciaUseCase, opcoes),
    buscar: modulo.get(BuscarOrdemServicoUseCase, opcoes),
    ajustarInventario: modulo.get(AjustarEstoqueDivergenciaUseCase, opcoes),
  };
}

export async function criarCatalogoSaga(
  prisma: PrismaService,
  rotulo: string,
): Promise<CatalogoSaga> {
  const sufixo = randomUUID().slice(0, 8);
  const cliente = await prisma.cliente.create({
    data: {
      nome: `Cliente ${rotulo} ${sufixo}`,
      cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '4'),
      email: `${rotulo}-${sufixo}@test.local`,
      telefone: '11966665555',
    },
  });
  const veiculo = await prisma.veiculo.create({
    data: {
      clienteId: cliente.id,
      placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
      modelo: 'Teste',
      marca: 'Marca',
      ano: 2022,
    },
  });
  const servico = await prisma.servico.create({
    data: {
      nome: `Serviço ${rotulo} ${sufixo}`,
      descricao: 'Teste',
      precoBase: 100,
      tempoEstimadoMin: 30,
    },
  });
  return {
    clienteId: cliente.id,
    veiculoId: veiculo.id,
    servicoId: servico.id,
  };
}

export async function criarPecaSaga(
  prisma: PrismaService,
  rotulo: string,
  estoque = 50,
): Promise<string> {
  const peca = await prisma.peca.create({
    data: {
      codigo: `P-${rotulo}-${randomUUID().slice(0, 8)}`,
      nome: `Peça ${rotulo}`,
      precoUnitario: 40,
      quantidadeEstoque: estoque,
    },
  });
  return peca.id;
}

export const envelopeSaga = montarEnvelopeE42;

/** OS com diagnóstico concluído, orçamento gerado e estoque reservado (AGUARDANDO_PAGAMENTO). */
export async function prepararAguardandoPagamento(
  servicos: ServicosSaga,
  catalogo: CatalogoSaga,
  pecas: { pecaId: string; quantidade: number }[],
): Promise<OsEmAndamento> {
  const { criarOs, concluirDiagnostico, reservar, processar } = servicos;
  const os = await criarOs.execute({
    clienteId: catalogo.clienteId,
    veiculoId: catalogo.veiculoId,
    descricaoProblema: 'Correção saga OS',
    sugestoes: pecas.map((p) => ({
      tipo: 'PECA' as const,
      itemId: p.pecaId,
      quantidade: p.quantidade,
    })),
  });
  const correlationId = os.correlationId;
  const tarefaId = `${os.id}#1#DIAGNOSTICO`;
  await processar.executar(
    envelopeSaga(EVENTO_DIAGNOSTICO_INICIADO, os.id, correlationId, 1, {
      tarefaId,
    }),
  );
  await concluirDiagnostico.execute({
    ordemServicoId: os.id,
    rodada: 1,
    tarefaId,
    laudo: 'Laudo',
    itens: [
      { tipo: 'SERVICO', itemId: catalogo.servicoId, quantidade: 1 },
      ...pecas.map((p) => ({
        tipo: 'PECA' as const,
        itemId: p.pecaId,
        quantidade: p.quantidade,
      })),
    ],
    idempotencyKey: `diagnostico:${tarefaId}`,
  });
  await processar.executar(
    envelopeSaga(EVENTO_ORCAMENTO_GERADO, os.id, correlationId, 1, {
      orcamentoId: randomUUID(),
      valorTotalCentavos: 50000,
    }),
  );
  await reservar.execute({
    ordemServicoId: os.id,
    rodada: 1,
    orcamentoId: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  return { osId: os.id, correlationId };
}

export const entregar = (
  servicos: ServicosSaga,
  os: OsEmAndamento,
  eventType: string,
  payload: Record<string, unknown>,
  rodada = 1,
  eventId = randomUUID(),
  occurredAt?: string,
) =>
  servicos.processar.executar(
    envelopeSaga(
      eventType,
      os.osId,
      os.correlationId,
      rodada,
      payload,
      eventId,
      occurredAt,
    ),
  );

export const cobrancaCriada = (
  servicos: ServicosSaga,
  os: OsEmAndamento,
  cobrancaId: string,
  orderId: string,
) =>
  entregar(servicos, os, EVENTO_COBRANCA_CRIADA, {
    cobrancaId,
    orderId,
    linkPagamento: `https://pagamento.test/checkout?order_id=${orderId}`,
    prazoPagamento: '2030-01-01T00:00:00.000Z',
    valorCentavos: 50000,
  });

export const pagamentoConfirmado = (
  servicos: ServicosSaga,
  os: OsEmAndamento,
  cobrancaId: string,
  orderId: string,
) =>
  entregar(servicos, os, EVENTO_PAGAMENTO_CONFIRMADO, {
    cobrancaId,
    orderId,
    aprovadoEm: '2026-06-15T13:00:00.000Z',
    valorCentavos: 50000,
  });

export async function iniciarEConcluirReparo(
  servicos: ServicosSaga,
  os: OsEmAndamento,
  pecasUtilizadas: { itemId: string; quantidade: number }[],
): Promise<void> {
  await entregar(servicos, os, EVENTO_REPARO_INICIADO, {
    tarefaId: `${os.osId}#1#REPARO`,
  });
  await entregar(servicos, os, EVENTO_REPARO_CONCLUIDO, {
    pecasUtilizadas,
    divergencias: [],
  });
}

export async function statusDaOs(
  prisma: PrismaService,
  osId: string,
): Promise<string> {
  return (
    await prisma.ordemServico.findUniqueOrThrow({
      where: { id: osId },
      select: { status: true },
    })
  ).status;
}

export const contarOutboxSaga = (
  prisma: PrismaService,
  correlationId: string,
  eventType: string,
) => prisma.outboxMensagem.count({ where: { correlationId, eventType } });

export const contarPendenciasFinanceiras = (
  prisma: PrismaService,
  osId: string,
  resolvida = false,
) =>
  prisma.pendenciaOs.count({
    where: { ordemServicoId: osId, tipo: 'FINANCEIRA', resolvida },
  });

/** Payload de um exemplo `execution.*` publicado pelo Execution (test/contratos/execution). */
export const payloadDoExemploExecution = (nome: string) =>
  carregarExemplo('execution', nome).envelope.payload;

/** Payload de um exemplo `billing.*` publicado pelo Billing (test/contratos/billing). */
export const payloadDoExemploBilling = (nome: string) =>
  carregarExemplo('billing', nome).envelope.payload;
