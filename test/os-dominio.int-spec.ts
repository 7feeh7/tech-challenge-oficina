import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { AtualizarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/atualizar-ordem-servico.use-case';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { ListarOrdensServicoUseCase } from '@/modules/ordens-servico/application/use-cases/listar-ordens-servico.use-case';
import { RegistrarDesistenciaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-desistencia.use-case';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { TransicaoStatusInvalidaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { OrdensServicoModule } from '@/modules/ordens-servico/ordens-servico.module';
import { PrismaModule } from '@/shared/database/prisma.module';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/database/unit-of-work.port';
import { runWithObservabilityContext } from '@/shared/http/correlation-id.context';
import {
  COMANDO_INICIAR_DIAGNOSTICO,
  DESTINO_FILA_EXECUTION,
  DESTINO_TOPICO_NOTIFICACAO,
  EVENTO_STATUS_CHANGED,
} from '@/shared/messaging/envelope';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { StatusOS } from '@/shared/generated/prisma/enums';
import {
  exigirDatabaseUrl,
  verificarConexaoPostgres,
} from './helpers/exigir-database-integracao';
import { fecharModuloIntegracao } from './helpers/fechar-modulo-integracao';

describe('OS — domínio da ordem (integração)', () => {
  let nestModule: TestingModule;
  let prisma: PrismaService;
  let unitOfWork: UnitOfWork;
  let transicoes: TransicaoOrdemServicoService;
  let criar: CriarOrdemServicoUseCase;
  let atualizar: AtualizarOrdemServicoUseCase;
  let desistir: RegistrarDesistenciaUseCase;
  let listar: ListarOrdensServicoUseCase;
  const sufixo = randomUUID().slice(0, 8);
  let clienteId: string;
  let veiculoId: string;
  let pecaId: string;
  let servicoId: string;

  beforeAll(async () => {
    exigirDatabaseUrl();

    nestModule = await Test.createTestingModule({
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
        PrismaModule,
        OrdensServicoModule,
      ],
    }).compile();

    prisma = nestModule.get(PrismaService);
    await verificarConexaoPostgres(() => prisma.$queryRaw`SELECT 1`);

    unitOfWork = nestModule.get<UnitOfWork>(UNIT_OF_WORK);
    transicoes = nestModule.get(TransicaoOrdemServicoService);
    criar = nestModule.get(CriarOrdemServicoUseCase);
    atualizar = nestModule.get(AtualizarOrdemServicoUseCase);
    desistir = nestModule.get(RegistrarDesistenciaUseCase);
    listar = nestModule.get(ListarOrdensServicoUseCase);

    const cliente = await prisma.cliente.create({
      data: {
        nome: `Cliente ${sufixo}`,
        cpfCnpj: randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '7'),
        email: `os-dominio-${sufixo}@test.local`,
        telefone: '11999990000',
      },
    });
    clienteId = cliente.id;
    const veiculo = await prisma.veiculo.create({
      data: {
        placa: randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
        marca: 'Test',
        modelo: 'Modelo Teste',
        ano: 2024,
        clienteId,
      },
    });
    veiculoId = veiculo.id;
    pecaId = (
      await prisma.peca.create({
        data: {
          codigo: `OSD-${sufixo}`,
          nome: `Peça ${sufixo}`,
          precoUnitario: 10,
          quantidadeEstoque: 100,
        },
      })
    ).id;
    servicoId = (
      await prisma.servico.create({
        data: {
          nome: `Serviço ${sufixo}`,
          precoBase: 50,
          tempoEstimadoMin: 30,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await fecharModuloIntegracao(nestModule);
  });

  async function abrirOs(
    input: Parameters<CriarOrdemServicoUseCase['execute']>[0],
  ): Promise<{ id: string }> {
    const saida = await criar.execute(input);
    if (!saida.id) {
      throw new Error('A abertura da OS não devolveu o id');
    }
    return { id: saida.id };
  }

  function mensagensDaOs(ordemServicoId: string) {
    return prisma.outboxMensagem.findMany({
      where: { envelope: { path: ['ordemServicoId'], equals: ordemServicoId } },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async function criarOrdemPersistida(
    status: StatusOS,
    prioridadeFila: number,
    criadoEm?: Date,
  ) {
    return prisma.ordemServico.create({
      data: {
        clienteId,
        veiculoId,
        status,
        prioridadeFila,
        correlationId: randomUUID(),
        ...(criadoEm ? { criadoEm } : {}),
      },
    });
  }

  describe('abertura', () => {
    it('persiste sugestões sem preço, correlationId, histórico e outbox na mesma transação', async () => {
      const saida = await abrirOs({
        clienteId,
        veiculoId,
        descricaoProblema: 'Barulho no freio',
        pecas: [{ pecaId, quantidade: 2 }],
        servicos: [{ servicoId }],
      });

      const ordem = await prisma.ordemServico.findUniqueOrThrow({
        where: { id: saida.id },
        include: {
          sugestoesItens: true,
          pecas: true,
          servicos: true,
          historicoStatus: true,
        },
      });

      expect(ordem.status).toBe(StatusOS.RECEBIDA);
      expect(ordem.rodadaVigente).toBe(1);
      expect(ordem.prioridadeFila).toBe(6);
      expect(ordem.correlationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(ordem.sugestoesItens).toHaveLength(2);
      expect(ordem.pecas).toHaveLength(0);
      expect(ordem.servicos).toHaveLength(0);
      expect(ordem.historicoStatus).toHaveLength(1);
      expect(ordem.historicoStatus[0]).toMatchObject({
        statusAnterior: null,
        statusNovo: StatusOS.RECEBIDA,
        rodada: 1,
      });

      const mensagens = await mensagensDaOs(saida.id);
      const notificacao = mensagens.find(
        (m) => m.eventType === EVENTO_STATUS_CHANGED,
      );
      const diagnostico = mensagens.find(
        (m) => m.eventType === COMANDO_INICIAR_DIAGNOSTICO,
      );
      expect(mensagens).toHaveLength(2);
      expect(notificacao?.destino).toBe(DESTINO_TOPICO_NOTIFICACAO);
      expect(notificacao?.eventId).toBe(ordem.historicoStatus[0].eventId);
      expect(diagnostico?.destino).toBe(DESTINO_FILA_EXECUTION);
      expect(
        mensagens.every((m) => m.correlationId === ordem.correlationId),
      ).toBe(true);
      expect(diagnostico?.envelope).toMatchObject({
        causationId: notificacao?.eventId,
        rodada: 1,
        payload: {
          veiculo: { modelo: 'Modelo Teste' },
          descricaoProblema: 'Barulho no freio',
          sugestoes: expect.arrayContaining([
            { tipo: 'PECA', itemId: pecaId, quantidade: 2 },
            { tipo: 'SERVICO', itemId: servicoId, quantidade: 1 },
          ]),
        },
      });
    });

    it('rejeita no banco item oficial sem preço (peça e serviço)', async () => {
      const ordem = await criarOrdemPersistida(StatusOS.EM_DIAGNOSTICO, 5);

      await expect(
        prisma.ordemServicoPeca.create({
          data: { ordemServicoId: ordem.id, pecaId, quantidade: 1 } as never,
        }),
      ).rejects.toThrow();
      await expect(
        prisma.ordemServicoServico.create({
          data: { ordemServicoId: ordem.id, servicoId, quantidade: 1 } as never,
        }),
      ).rejects.toThrow();
    });

    it('rejeita no banco sugestão com quantidade inválida e rodada menor que 1', async () => {
      const ordem = await criarOrdemPersistida(StatusOS.RECEBIDA, 6);

      await expect(
        prisma.sugestaoItemOs.create({
          data: {
            ordemServicoId: ordem.id,
            tipo: 'PECA',
            itemId: pecaId,
            quantidade: 0,
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.ordemServico.update({
          where: { id: ordem.id },
          data: { rodadaVigente: 0 },
        }),
      ).rejects.toThrow();
    });
  });

  describe('transições sob bloqueio', () => {
    it('usa o correlationId persistido da OS, não o da requisição', async () => {
      const saida = await abrirOs({ clienteId, veiculoId });
      const persistida = await prisma.ordemServico.findUniqueOrThrow({
        where: { id: saida.id },
      });
      const correlationDaRequisicao = randomUUID();

      await runWithObservabilityContext(
        { correlationId: correlationDaRequisicao },
        () => desistir.execute(saida.id, { motivo: 'Cliente desistiu' }),
      );

      const mensagens = await mensagensDaOs(saida.id);
      const notificacoes = mensagens.filter(
        (m) => m.eventType === EVENTO_STATUS_CHANGED,
      );
      expect(notificacoes).toHaveLength(2);
      expect(
        mensagens.every((m) => m.correlationId === persistida.correlationId),
      ).toBe(true);
      expect(persistida.correlationId).not.toBe(correlationDaRequisicao);
    });

    it('desfaz status, histórico e outbox quando a transação falha depois da transição', async () => {
      const saida = await abrirOs({ clienteId, veiculoId });
      const mensagensAntes = await mensagensDaOs(saida.id);

      await expect(
        unitOfWork.executar(async (contexto) => {
          await transicoes.aplicar(contexto, {
            ordemServicoId: saida.id,
            aplicar: (ordem, ocorridoEm) =>
              ordem.registrarDesistencia('Motivo', ocorridoEm),
          });
          throw new Error('falha após a transição');
        }),
      ).rejects.toThrow('falha após a transição');

      const ordem = await prisma.ordemServico.findUniqueOrThrow({
        where: { id: saida.id },
        include: { historicoStatus: true },
      });
      expect(ordem.status).toBe(StatusOS.RECEBIDA);
      expect(ordem.historicoStatus).toHaveLength(1);
      expect(await mensagensDaOs(saida.id)).toHaveLength(mensagensAntes.length);
    });

    it('duas desistências concorrentes geram uma única transição, histórico e notificação', async () => {
      const saida = await abrirOs({ clienteId, veiculoId });

      const resultados = await Promise.allSettled([
        desistir.execute(saida.id, { motivo: 'Motivo A' }),
        desistir.execute(saida.id, { motivo: 'Motivo B' }),
        desistir.execute(saida.id, { motivo: 'Motivo C' }),
      ]);

      expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
      const ordem = await prisma.ordemServico.findUniqueOrThrow({
        where: { id: saida.id },
        include: { historicoStatus: { orderBy: { ocorridoEm: 'asc' } } },
      });
      expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
      expect(ordem.etapaOrigemCancelamento).toBe(StatusOS.RECEBIDA);
      expect(ordem.motivoEncerramento).toMatch(/^Motivo [ABC]$/);
      expect(
        ordem.historicoStatus.filter(
          (h) => h.statusNovo === StatusOS.EM_CANCELAMENTO,
        ),
      ).toHaveLength(1);

      const notificacoes = (await mensagensDaOs(saida.id)).filter(
        (m) => m.eventType === EVENTO_STATUS_CHANGED,
      );
      expect(notificacoes).toHaveLength(2);
    });

    it('serializa desistência e geração de orçamento sem corromper a cadeia de status', async () => {
      const saida = await abrirOs({ clienteId, veiculoId });
      await prisma.ordemServico.update({
        where: { id: saida.id },
        data: { status: StatusOS.EM_DIAGNOSTICO, prioridadeFila: 5 },
      });

      const [orcamento, desistencia] = await Promise.allSettled([
        unitOfWork.executar((contexto) =>
          transicoes.aplicar(contexto, {
            ordemServicoId: saida.id,
            aplicar: (ordem, ocorridoEm) =>
              ordem.registrarOrcamentoGerado(ocorridoEm),
          }),
        ),
        desistir.execute(saida.id, { motivo: 'Cliente desistiu' }),
      ]);

      expect(desistencia.status).toBe('fulfilled');
      if (orcamento.status === 'rejected') {
        expect(orcamento.reason).toBeInstanceOf(TransicaoStatusInvalidaError);
      }

      const historico = await prisma.historicoStatusOS.findMany({
        where: { ordemServicoId: saida.id, statusAnterior: { not: null } },
        orderBy: { ocorridoEm: 'asc' },
      });
      let atual: StatusOS = StatusOS.EM_DIAGNOSTICO;
      for (const linha of historico) {
        expect(linha.statusAnterior).toBe(atual);
        atual = linha.statusNovo;
      }
      const ordem = await prisma.ordemServico.findUniqueOrThrow({
        where: { id: saida.id },
      });
      expect(ordem.status).toBe(atual);
      expect(ordem.status).toBe(StatusOS.EM_CANCELAMENTO);
    });

    it('PATCH da descrição não gera histórico nem notificação', async () => {
      const saida = await abrirOs({
        clienteId,
        veiculoId,
        descricaoProblema: 'Antes',
      });
      const antes = await mensagensDaOs(saida.id);

      await atualizar.execute(saida.id, { descricaoProblema: 'Depois' });

      const ordem = await prisma.ordemServico.findUniqueOrThrow({
        where: { id: saida.id },
        include: { historicoStatus: true },
      });
      expect(ordem.descricaoProblema).toBe('Depois');
      expect(ordem.historicoStatus).toHaveLength(1);
      expect(await mensagensDaOs(saida.id)).toHaveLength(antes.length);
    });
  });

  describe('fila de trabalho', () => {
    it('ordena por prioridade persistida e depois pela mais antiga, sem encerradas', async () => {
      const base = Date.now() - 60_000;
      const recebidaAntiga = await criarOrdemPersistida(
        StatusOS.RECEBIDA,
        6,
        new Date(base),
      );
      const recebidaNova = await criarOrdemPersistida(
        StatusOS.RECEBIDA,
        6,
        new Date(base + 1000),
      );
      const emExecucao = await criarOrdemPersistida(
        StatusOS.EM_EXECUCAO,
        1,
        new Date(base + 2000),
      );
      const aguardandoPagamento = await criarOrdemPersistida(
        StatusOS.AGUARDANDO_PAGAMENTO,
        3,
        new Date(base + 3000),
      );
      const cancelada = await criarOrdemPersistida(StatusOS.CANCELADA, 901);
      const finalizada = await criarOrdemPersistida(StatusOS.FINALIZADA, 900);
      const meus = new Set(
        [
          recebidaAntiga,
          recebidaNova,
          emExecucao,
          aguardandoPagamento,
          cancelada,
          finalizada,
        ].map((o) => o.id),
      );

      const totalAtivas = await prisma.ordemServico.count({
        where: {
          status: {
            notIn: [StatusOS.CANCELADA, StatusOS.FINALIZADA, StatusOS.ENTREGUE],
          },
        },
      });
      const pagina = await listar.execute(1, totalAtivas + 10);
      const ids = pagina.data
        .map((o) => o.id)
        .filter((id): id is string => id !== undefined && meus.has(id));

      expect(ids).toEqual([
        emExecucao.id,
        aguardandoPagamento.id,
        recebidaAntiga.id,
        recebidaNova.id,
      ]);
    });

    it('pagina pelo mesmo critério de ordenação', async () => {
      const primeira = await listar.execute(1, 1);
      const segunda = await listar.execute(2, 1);

      expect(primeira.data).toHaveLength(1);
      expect(segunda.data).toHaveLength(1);
      expect(primeira.data[0].id).not.toBe(segunda.data[0].id);
    });
  });
});
