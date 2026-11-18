import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validarRespostaCancelamento } from '@/modules/coordenacao-saga/domain/validar-resposta-cancelamento';
import { PROCESSADORES_MENSAGEM } from '@/shared/messaging/application/ports/tokens';
import type { ProcessadorMensagem } from '@/shared/messaging/application/ports/processador-mensagem.port';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  COMANDO_GERAR_ORCAMENTO,
  COMANDO_INICIAR_DIAGNOSTICO,
  COMANDO_INICIAR_REPARO,
  EVENTO_PAGAMENTO_DISPONIVEL,
} from '@/shared/messaging/envelope';
import { validarEnvelopeBase } from '@/shared/messaging/validar-envelope';
import {
  SituacaoReservaEstoque,
  StatusOS,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import { AmbienteBdd, type Catalogo } from './bdd/helpers/ambiente-bdd';
import { estoqueDaPeca, reservasDaOrdem } from './bdd/helpers/estoque-bdd';
import { JornadaOs } from './bdd/helpers/jornada-os';
import {
  instanciarExemplo,
  verificarFormatoDoComando,
} from './bdd/helpers/mensagens-do-exemplo';
import {
  carregarExemplo,
  listarExemplos,
  type ServicoContrato,
} from './helpers/exemplos-contrato';

type Direcao = 'RECEBIDA_PELO_OS' | 'EMITIDA_PELO_OS';

/** Direção de cada exemplo conforme o mapa de interações de 03-service-boundaries.md. */
const INVENTARIO: Record<ServicoContrato, Record<string, Direcao>> = {
  billing: {
    'billing.cancelar-financeiro.v1': 'EMITIDA_PELO_OS',
    'billing.cobranca-criada.v1': 'RECEBIDA_PELO_OS',
    'billing.cobranca-expirada.v1': 'RECEBIDA_PELO_OS',
    'billing.consultar-situacao-financeira.v1': 'EMITIDA_PELO_OS',
    'billing.estorno-concluido.v1': 'RECEBIDA_PELO_OS',
    'billing.gerar-orcamento.v1': 'EMITIDA_PELO_OS',
    'billing.orcamento-gerado.v1': 'RECEBIDA_PELO_OS',
    'billing.orcamento-rejeitado.v1': 'RECEBIDA_PELO_OS',
    'billing.pagamento-confirmado.v1': 'RECEBIDA_PELO_OS',
    'billing.pagamento-tardio-registrado.v1': 'RECEBIDA_PELO_OS',
    'billing.pendencia-resolvida.v1': 'RECEBIDA_PELO_OS',
    'billing.resposta-cancelamento-financeiro.v1': 'RECEBIDA_PELO_OS',
    'billing.situacao-financeira.indeterminada.v1': 'RECEBIDA_PELO_OS',
    'billing.situacao-financeira.v1': 'RECEBIDA_PELO_OS',
  },
  execution: {
    'execution.cancelar-tarefa.v1': 'EMITIDA_PELO_OS',
    'execution.diagnostico-iniciado.v1': 'RECEBIDA_PELO_OS',
    'execution.iniciar-diagnostico.v1': 'EMITIDA_PELO_OS',
    'execution.iniciar-reparo.v1': 'EMITIDA_PELO_OS',
    'execution.reparo-concluido-compatibilidade.v1': 'RECEBIDA_PELO_OS',
    'execution.reparo-concluido-consumo-acima.v1': 'RECEBIDA_PELO_OS',
    'execution.reparo-concluido-consumo-zero.v1': 'RECEBIDA_PELO_OS',
    'execution.reparo-concluido.v1': 'RECEBIDA_PELO_OS',
    'execution.reparo-falhou-divergencia.v1': 'RECEBIDA_PELO_OS',
    'execution.reparo-falhou.v1': 'RECEBIDA_PELO_OS',
    'execution.reparo-iniciado.v1': 'RECEBIDA_PELO_OS',
    'execution.reparo-interrompido.v1': 'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-cancelada-em-andamento-diagnostico.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-cancelada-sem-existir.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-interrupcao-solicitada-reparo.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-ja-concluida-diagnostico.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-ja-concluida-reparo.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-ja-encerrada-diagnostico-cancelado.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-ja-encerrada-reparo-falhou.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-ja-encerrada-reparo-interrompido.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento-retrocompatibilidade.v1':
      'RECEBIDA_PELO_OS',
    'execution.resposta-cancelamento.v1': 'RECEBIDA_PELO_OS',
    'execution.tarefa-devolvida-a-fila.v1': 'RECEBIDA_PELO_OS',
  },
};

const COMANDOS_DO_OS = [
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  COMANDO_GERAR_ORCAMENTO,
  COMANDO_INICIAR_DIAGNOSTICO,
  COMANDO_INICIAR_REPARO,
];

const ORIGENS_ESPERADAS: Record<
  ServicoContrato,
  { repositorio: string; commit: string }
> = {
  billing: { repositorio: 'tech-challenge-billing', commit: '568e04e' },
  execution: { repositorio: 'tech-challenge-execution', commit: 'b8d52c6' },
};

const ID_PECA_DOS_EXEMPLOS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const ID_OUTRA_PECA_DOS_EXEMPLOS = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CONSULTA_DO_EXEMPLO = 'f7e1d5c4-9a6b-7c2d-1e4f-5a8b0c3d6e9f';
const CONSULTA_INDETERMINADA_DO_EXEMPLO =
  'a8f2e6d5-0b7c-8d3e-2f5a-6b9c1d4e7f0a';

describe('Contratos publicados pelo Billing e pelo Execution', () => {
  describe('inventário dos exemplos copiados', () => {
    for (const servico of ['billing', 'execution'] as const) {
      it(`${servico}: tem todos os exemplos esperados, nenhum a mais, e registra a origem`, () => {
        const pasta = join(__dirname, 'contratos', servico);
        const arquivos = readdirSync(pasta)
          .filter((arquivo) => arquivo.endsWith('.json'))
          .map((arquivo) => arquivo.replace(/\.json$/, ''))
          .sort();
        expect(arquivos).toEqual(Object.keys(INVENTARIO[servico]).sort());

        const origem = join(pasta, 'ORIGEM.md');
        expect(existsSync(origem)).toBe(true);
        const texto = readFileSync(origem, 'utf8');
        expect(texto).toContain(ORIGENS_ESPERADAS[servico].repositorio);
        expect(texto).toContain(ORIGENS_ESPERADAS[servico].commit);
        expect(texto).toContain('docs/contratos/exemplos/');
      });
    }

    it('totaliza 14 exemplos do Billing e 24 do Execution', () => {
      expect(listarExemplos('billing')).toHaveLength(14);
      expect(listarExemplos('execution')).toHaveLength(24);
    });

    for (const servico of ['billing', 'execution'] as const) {
      for (const [nome, direcao] of Object.entries(INVENTARIO[servico])) {
        it(`${nome}: envelope válido e direção ${direcao}`, () => {
          const { envelope } = carregarExemplo(servico, nome);
          expect(() => validarEnvelopeBase(envelope)).not.toThrow();
          expect(envelope.version).toBe(1);
          if (direcao === 'EMITIDA_PELO_OS') {
            expect(COMANDOS_DO_OS).toContain(envelope.eventType);
            expect(envelope.source).toBe('os-service');
          } else {
            expect(COMANDOS_DO_OS).not.toContain(envelope.eventType);
            expect(envelope.source).not.toBe('os-service');
            expect(envelope.eventType.startsWith(`${servico}.`)).toBe(true);
          }
          expect(nome.startsWith(envelope.eventType.replace(/\.v1$/, ''))).toBe(
            true,
          );
        });
      }
    }
  });

  describe('resposta de cancelamento do Execution: todas as combinações pelo validador real', () => {
    const respostas = Object.keys(INVENTARIO.execution).filter((nome) =>
      nome.startsWith('execution.resposta-cancelamento'),
    );

    it('cobre as 11 variações publicadas', () => {
      expect(respostas).toHaveLength(11);
    });

    for (const nome of respostas) {
      it(`${nome}: aceita`, () => {
        const { envelope } = carregarExemplo('execution', nome);
        const resposta = validarRespostaCancelamento(envelope.payload);
        expect(resposta.tipoTarefa).toBe(envelope.payload.tipoTarefa);
        expect(resposta.resultado).toBe(envelope.payload.resultado);
      });
    }

    it('retrocompatibilidade: aceita a mensagem sem os campos aditivos e não os inventa', () => {
      const { payload } = carregarExemplo(
        'execution',
        'execution.resposta-cancelamento-retrocompatibilidade.v1',
      ).envelope;
      expect(payload).not.toHaveProperty('situacaoTarefa');
      expect(payload).not.toHaveProperty('encerradaEm');
      const resposta = validarRespostaCancelamento(payload);
      expect(resposta.situacaoTarefa).toBeUndefined();
      expect(resposta.encerradaEm).toBeUndefined();
      expect(resposta.fatoTerminalEventId).toBeUndefined();
    });

    it('diagnóstico não aceita listas de consumo nem fatoTerminalEventId', () => {
      const { payload } = carregarExemplo(
        'execution',
        'execution.resposta-cancelamento-ja-concluida-diagnostico.v1',
      ).envelope;
      expect(() =>
        validarRespostaCancelamento({ ...payload, pecasUtilizadas: [] }),
      ).toThrow(ErroMensagemPermanente);
      expect(() =>
        validarRespostaCancelamento({
          ...payload,
          fatoTerminalEventId: '550e8400-e29b-41d4-a716-446655440016',
        }),
      ).toThrow(ErroMensagemPermanente);
    });

    it('reparo concluído sem encerradaEm, falho sem motivo e divergência acima sem justificativa são recusados', () => {
      const concluido = carregarExemplo(
        'execution',
        'execution.resposta-cancelamento-ja-concluida-reparo.v1',
      ).envelope.payload;
      const { encerradaEm, ...semEncerradaEm } = concluido;
      void encerradaEm;
      expect(() => validarRespostaCancelamento(semEncerradaEm)).toThrow(
        ErroMensagemPermanente,
      );
      const falho = carregarExemplo(
        'execution',
        'execution.resposta-cancelamento-ja-encerrada-reparo-falhou.v1',
      ).envelope.payload;
      expect(() =>
        validarRespostaCancelamento({ ...falho, motivo: ' ' }),
      ).toThrow(ErroMensagemPermanente);
      expect(() =>
        validarRespostaCancelamento({
          ...concluido,
          divergencias: [
            {
              itemId: ID_PECA_DOS_EXEMPLOS,
              tipo: 'CONSUMO_ACIMA',
              quantidadePrevista: 2,
              quantidadeUtilizada: 3,
              observacao: 'acima',
            },
          ],
        }),
      ).toThrow(ErroMensagemPermanente);
    });
  });

  describe('o OS consome e emite com os mecanismos reais', () => {
    let ambiente: AmbienteBdd;
    let catalogo: Catalogo;

    beforeAll(async () => {
      ambiente = await AmbienteBdd.criar();
      catalogo = await ambiente.criarCatalogo();
    });

    afterAll(async () => {
      await ambiente.encerrar();
    });

    interface Cenario {
      jornada: JornadaOs;
      pecaA: { id: string };
      pecaB: { id: string };
      consultaId?: string;
    }

    type Estado =
      | 'RECEBIDA'
      | 'EM_DIAGNOSTICO'
      | 'DIAGNOSTICO_CONCLUIDO'
      | 'AGUARDANDO_APROVACAO'
      | 'AGUARDANDO_PAGAMENTO'
      | 'AGUARDANDO_EXECUCAO'
      | 'EM_EXECUCAO'
      | 'CANCELAMENTO_NO_DIAGNOSTICO'
      | 'CANCELAMENTO_COM_REPARO'
      | 'CANCELAMENTO_NO_FINANCEIRO'
      | 'CANCELADA'
      | 'CONSULTA_FINANCEIRA';

    /** Leva uma ordem nova até o estado pedido pelos mesmos caminhos do atendimento. */
    const ordemEm = async (estado: Estado): Promise<Cenario> => {
      const pecaA = await ambiente.criarPeca('Pastilha de freio', 50, 10);
      const pecaB = await ambiente.criarPeca('Parafuso especial', 5, 5);
      const jornada = await JornadaOs.abrir(ambiente, catalogo, {
        descricaoProblema: 'Barulho ao frear',
        pecas: [{ pecaId: pecaA.id, quantidade: 2 }],
      });
      const cenario: Cenario = { jornada, pecaA, pecaB };
      if (estado === 'RECEBIDA') {
        return cenario;
      }
      await jornada.execution.iniciarDiagnostico();
      if (estado === 'EM_DIAGNOSTICO') {
        return cenario;
      }
      if (estado === 'CANCELAMENTO_NO_DIAGNOSTICO') {
        await jornada.desistir('Cliente desistiu');
        await jornada.caixa.receberProximo(COMANDO_CANCELAR_TAREFA);
        return cenario;
      }
      await jornada.execution.concluirDiagnostico(
        [
          { tipo: 'SERVICO', itemId: catalogo.servicoId, quantidade: 1 },
          { tipo: 'PECA', itemId: pecaA.id, quantidade: 2 },
        ],
        'Pastilhas gastas',
      );
      if (estado === 'DIAGNOSTICO_CONCLUIDO') {
        return cenario;
      }
      await jornada.billing.gerarOrcamento();
      if (estado === 'AGUARDANDO_APROVACAO') {
        return cenario;
      }
      await jornada.billing.aprovarOrcamento();
      if (estado === 'CONSULTA_FINANCEIRA') {
        await ambiente.vencerPrazoDeReferencia(jornada.ordemServicoId);
        await ambiente.verificadorDePrazo.processarLote();
        const consulta = await jornada.caixa.receberProximo(
          COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
        );
        cenario.consultaId = (
          consulta.payload as { consultaId: string }
        ).consultaId;
        return cenario;
      }
      if (estado === 'CANCELAMENTO_NO_FINANCEIRO' || estado === 'CANCELADA') {
        await jornada.desistir('Cliente desistiu');
        if (estado === 'CANCELADA') {
          await jornada.billing.responderCancelamentoFinanceiro('CANCELADA');
        }
        return cenario;
      }
      if (estado === 'AGUARDANDO_PAGAMENTO') {
        return cenario;
      }
      await jornada.billing.criarCobranca();
      await jornada.billing.confirmarPagamento();
      if (estado === 'AGUARDANDO_EXECUCAO') {
        return cenario;
      }
      await jornada.execution.iniciarReparo();
      if (estado === 'EM_EXECUCAO') {
        return cenario;
      }
      await jornada.desistir('Cliente desistiu');
      await jornada.caixa.receberProximo(COMANDO_CANCELAR_TAREFA);
      return cenario;
    };

    const entregar = async (
      cenario: Cenario,
      servico: ServicoContrato,
      nome: string,
      substituicoes: Record<string, string> = {},
    ) => {
      const mensagem = instanciarExemplo(servico, nome, {
        ordemServicoId: cenario.jornada.ordemServicoId,
        correlationId: cenario.jornada.correlationId,
        substituicoes: {
          [ID_PECA_DOS_EXEMPLOS]: cenario.pecaA.id,
          [ID_OUTRA_PECA_DOS_EXEMPLOS]: cenario.pecaB.id,
          ...substituicoes,
        },
      });
      await cenario.jornada.entregar(mensagem);
      return mensagem;
    };

    const consumoDa = (cenario: Cenario) =>
      ambiente.prisma.consumoAplicadoOs.findFirst({
        where: { ordemServicoId: cenario.jornada.ordemServicoId },
      });

    const inventarioAberto = (cenario: Cenario) =>
      ambiente.prisma.pendenciaOs.findMany({
        where: {
          ordemServicoId: cenario.jornada.ordemServicoId,
          tipo: TipoPendenciaOs.INVENTARIO,
          resolvida: false,
        },
      });

    describe('mensagens do Billing consumidas pelo OS', () => {
      it('billing.orcamento-gerado.v1 leva a ordem a aguardar a aprovação e guarda o orçamento', async () => {
        const c = await ordemEm('DIAGNOSTICO_CONCLUIDO');
        const mensagem = await entregar(
          c,
          'billing',
          'billing.orcamento-gerado.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.AGUARDANDO_APROVACAO);
        const projecao =
          await ambiente.prisma.projecaoFinanceiraOs.findFirstOrThrow({
            where: {
              ordemServicoId: c.jornada.ordemServicoId,
              natureza: 'ORCAMENTO',
            },
          });
        expect(projecao).toMatchObject({
          orcamentoId: mensagem.payload.orcamentoId,
          valorCentavos: mensagem.payload.valorTotalCentavos,
        });
      });

      it('billing.orcamento-rejeitado.v1 abre a rodada 2 e pede novo diagnóstico', async () => {
        const c = await ordemEm('AGUARDANDO_APROVACAO');
        await entregar(c, 'billing', 'billing.orcamento-rejeitado.v1');
        expect(await c.jornada.status()).toBe(StatusOS.EM_DIAGNOSTICO);
        expect(await c.jornada.rodadaVigente()).toBe(2);
        expect(
          (await c.jornada.caixa.emitidos(COMANDO_INICIAR_DIAGNOSTICO)).map(
            (comando) => comando.rodada,
          ),
        ).toEqual([1, 2]);
      });

      it('billing.cobranca-criada.v1 registra a order, mostra o link e notifica o cliente uma vez', async () => {
        const c = await ordemEm('AGUARDANDO_PAGAMENTO');
        const mensagem = await entregar(
          c,
          'billing',
          'billing.cobranca-criada.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
        const detalhe = await c.jornada.detalhe();
        expect(detalhe.resumoFinanceiro.pagamento).toMatchObject({
          orderId: mensagem.payload.orderId,
          linkPagamento: mensagem.payload.linkPagamento,
        });
        expect(await c.jornada.caixa.contar(EVENTO_PAGAMENTO_DISPONIVEL)).toBe(
          1,
        );
      });

      it('billing.pagamento-confirmado.v1 leva a ordem a aguardar a execução e pede o reparo uma vez', async () => {
        const c = await ordemEm('AGUARDANDO_PAGAMENTO');
        const mensagem = await entregar(
          c,
          'billing',
          'billing.pagamento-confirmado.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.AGUARDANDO_EXECUCAO);
        expect(await c.jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(1);
        await c.jornada.reentregar(mensagem);
        expect(await c.jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(1);
      });

      it('billing.cobranca-expirada.v1 inicia a compensação financeira', async () => {
        const c = await ordemEm('AGUARDANDO_PAGAMENTO');
        await entregar(c, 'billing', 'billing.cobranca-expirada.v1');
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          1,
        );
      });

      it('billing.pagamento-tardio-registrado.v1 é aceito com a ordem cancelada e não regride o estado', async () => {
        const c = await ordemEm('CANCELADA');
        const mensagem = await entregar(
          c,
          'billing',
          'billing.pagamento-tardio-registrado.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.CANCELADA);
        expect(
          await ambiente.prisma.mensagemProcessada.count({
            where: { eventId: mensagem.eventId },
          }),
        ).toBe(1);
      });

      it('billing.estorno-concluido.v1 é aceito com a ordem cancelada e não regride o estado', async () => {
        const c = await ordemEm('CANCELADA');
        const mensagem = await entregar(
          c,
          'billing',
          'billing.estorno-concluido.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.CANCELADA);
        expect(
          await ambiente.prisma.mensagemProcessada.count({
            where: { eventId: mensagem.eventId },
          }),
        ).toBe(1);
      });

      it('billing.pendencia-resolvida.v1 é aceito durante a compensação sem encerrar a ordem', async () => {
        const c = await ordemEm('CANCELAMENTO_NO_FINANCEIRO');
        const mensagem = await entregar(
          c,
          'billing',
          'billing.pendencia-resolvida.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
        expect(
          await ambiente.prisma.mensagemProcessada.count({
            where: { eventId: mensagem.eventId },
          }),
        ).toBe(1);
      });

      it('billing.resposta-cancelamento-financeiro.v1 (ESTORNADA) conclui a compensação e libera a reserva', async () => {
        const c = await ordemEm('CANCELAMENTO_NO_FINANCEIRO');
        await entregar(
          c,
          'billing',
          'billing.resposta-cancelamento-financeiro.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.CANCELADA);
        const [reserva] = await reservasDaOrdem(
          ambiente.prisma,
          c.jornada.ordemServicoId,
          c.pecaA.id,
        );
        expect(reserva.situacao).toBe(SituacaoReservaEstoque.LIBERADA);
      });

      it('billing.situacao-financeira.v1 (PAGO_NO_PRAZO) leva a ordem a aguardar a execução', async () => {
        const c = await ordemEm('CONSULTA_FINANCEIRA');
        await entregar(c, 'billing', 'billing.situacao-financeira.v1', {
          [CONSULTA_DO_EXEMPLO]: c.consultaId!,
        });
        expect(await c.jornada.status()).toBe(StatusOS.AGUARDANDO_EXECUCAO);
        expect(await c.jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(1);
      });

      it('billing.situacao-financeira.indeterminada.v1 mantém a ordem e a reserva', async () => {
        const c = await ordemEm('CONSULTA_FINANCEIRA');
        await entregar(
          c,
          'billing',
          'billing.situacao-financeira.indeterminada.v1',
          { [CONSULTA_INDETERMINADA_DO_EXEMPLO]: c.consultaId! },
        );
        expect(await c.jornada.status()).toBe(StatusOS.AGUARDANDO_PAGAMENTO);
        const [reserva] = await reservasDaOrdem(
          ambiente.prisma,
          c.jornada.ordemServicoId,
          c.pecaA.id,
        );
        expect(reserva.situacao).toBe(SituacaoReservaEstoque.ATIVA);
        expect(await c.jornada.caixa.contar(COMANDO_INICIAR_REPARO)).toBe(0);
      });
    });

    describe('mensagens do Execution consumidas pelo OS', () => {
      it('execution.diagnostico-iniciado.v1 leva a ordem ao diagnóstico', async () => {
        const c = await ordemEm('RECEBIDA');
        await entregar(c, 'execution', 'execution.diagnostico-iniciado.v1');
        expect(await c.jornada.status()).toBe(StatusOS.EM_DIAGNOSTICO);
      });

      it('execution.tarefa-devolvida-a-fila.v1 devolve a ordem à fila', async () => {
        const c = await ordemEm('EM_DIAGNOSTICO');
        await entregar(c, 'execution', 'execution.tarefa-devolvida-a-fila.v1');
        expect(await c.jornada.status()).toBe(StatusOS.RECEBIDA);
      });

      it('execution.reparo-iniciado.v1 leva a ordem à execução', async () => {
        const c = await ordemEm('AGUARDANDO_EXECUCAO');
        await entregar(c, 'execution', 'execution.reparo-iniciado.v1');
        expect(await c.jornada.status()).toBe(StatusOS.EM_EXECUCAO);
      });

      it('execution.reparo-concluido.v1 (consumo inferior) finaliza, baixa só o usado e preserva a auditoria', async () => {
        const c = await ordemEm('EM_EXECUCAO');
        const mensagem = await entregar(
          c,
          'execution',
          'execution.reparo-concluido.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.FINALIZADA);
        expect(await estoqueDaPeca(ambiente.prisma, c.pecaA.id)).toEqual({
          fisico: 9,
          reservado: 0,
        });
        const consumo = await consumoDa(c);
        expect(consumo).toMatchObject({
          eventId: mensagem.eventId,
          tipoFato: 'REPARO_CONCLUIDO',
          responsavelId: 'mecanico-1',
        });
        expect(consumo?.concluidoEm?.toISOString()).toBe(
          mensagem.payload.concluidoEm,
        );
        expect(consumo?.divergencias).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              tipo: 'CONSUMO_INFERIOR',
              pecaId: c.pecaA.id,
            }),
          ]),
        );
        expect(await inventarioAberto(c)).toHaveLength(0);
      });

      it('execution.reparo-concluido-consumo-zero.v1 finaliza e devolve a reserva ao estoque livre', async () => {
        const c = await ordemEm('EM_EXECUCAO');
        await entregar(
          c,
          'execution',
          'execution.reparo-concluido-consumo-zero.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.FINALIZADA);
        expect(await estoqueDaPeca(ambiente.prisma, c.pecaA.id)).toEqual({
          fisico: 10,
          reservado: 0,
        });
        const [reserva] = await reservasDaOrdem(
          ambiente.prisma,
          c.jornada.ordemServicoId,
          c.pecaA.id,
        );
        expect(reserva.situacao).toBe(SituacaoReservaEstoque.LIBERADA);
      });

      it('execution.reparo-concluido-consumo-acima.v1 limita a baixa à reserva, abre inventário e impede finalizar', async () => {
        const c = await ordemEm('EM_EXECUCAO');
        await entregar(
          c,
          'execution',
          'execution.reparo-concluido-consumo-acima.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.EM_EXECUCAO);
        expect(await estoqueDaPeca(ambiente.prisma, c.pecaA.id)).toEqual({
          fisico: 8,
          reservado: 0,
        });
        const [pendencia] = await inventarioAberto(c);
        expect(pendencia.detalhes).toMatchObject({
          natureza: 'DIVERGENCIA_CONSUMO',
          divergenciasAuditoria: expect.arrayContaining([
            expect.objectContaining({
              tipo: 'CONSUMO_ACIMA',
              justificativa: 'Peça adicional usada no reparo emergencial.',
            }),
          ]) as unknown,
        });
      });

      it('execution.reparo-concluido-compatibilidade.v1 aceita a mensagem sem os campos aditivos e não os inventa', async () => {
        const c = await ordemEm('EM_EXECUCAO');
        const mensagem = await entregar(
          c,
          'execution',
          'execution.reparo-concluido-compatibilidade.v1',
        );
        expect(mensagem.payload).not.toHaveProperty('responsavelId');
        expect(await c.jornada.status()).toBe(StatusOS.FINALIZADA);
        const consumo = await consumoDa(c);
        expect(consumo?.responsavelId).toBeNull();
        expect(consumo?.concluidoEm?.toISOString()).toBe(
          mensagem.payload.concluidoEm,
        );
        expect(await inventarioAberto(c)).toHaveLength(0);
      });

      it('execution.reparo-falhou.v1 inicia a compensação com o financeiro e sem pedir a tarefa de novo', async () => {
        const c = await ordemEm('EM_EXECUCAO');
        await entregar(c, 'execution', 'execution.reparo-falhou.v1');
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_TAREFA)).toBe(0);
        const pedidos = await c.jornada.caixa.emitidos(
          COMANDO_CANCELAR_FINANCEIRO,
        );
        expect(pedidos).toHaveLength(1);
        expect(pedidos[0].payload).toMatchObject({
          resultadoExecucao: 'REPARO_INICIADO',
        });
      });

      it('execution.reparo-falhou-divergencia.v1 (peça fora da lista) abre inventário sem baixar estoque livre', async () => {
        const c = await ordemEm('EM_EXECUCAO');
        await entregar(
          c,
          'execution',
          'execution.reparo-falhou-divergencia.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
        expect(await estoqueDaPeca(ambiente.prisma, c.pecaB.id)).toEqual({
          fisico: 5,
          reservado: 0,
        });
        const [pendencia] = await inventarioAberto(c);
        expect(pendencia.detalhes).toMatchObject({
          divergenciasAuditoria: expect.arrayContaining([
            expect.objectContaining({
              tipo: 'FORA_DA_LISTA',
              justificativa: 'Peça substituta emergencial',
            }),
          ]) as unknown,
        });
      });

      it('execution.reparo-interrompido.v1 durante a compensação reconcilia o consumo e segue ao financeiro', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        const mensagem = await entregar(
          c,
          'execution',
          'execution.reparo-interrompido.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
        expect(await consumoDa(c)).toMatchObject({
          eventId: mensagem.eventId,
          tipoFato: 'REPARO_INTERROMPIDO',
        });
        expect(await estoqueDaPeca(ambiente.prisma, c.pecaA.id)).toEqual({
          fisico: 9,
          reservado: 0,
        });
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          1,
        );
      });
    });

    describe('execution.resposta-cancelamento.v1 consumida pelo OS', () => {
      it.each([
        'execution.resposta-cancelamento.v1',
        'execution.resposta-cancelamento-cancelada-em-andamento-diagnostico.v1',
        'execution.resposta-cancelamento-ja-concluida-diagnostico.v1',
        'execution.resposta-cancelamento-ja-encerrada-diagnostico-cancelado.v1',
      ])(
        '%s: o diagnóstico segue a compensação, sem exceção E10',
        async (nome) => {
          const c = await ordemEm('CANCELAMENTO_NO_DIAGNOSTICO');
          const mensagem = await entregar(c, 'execution', nome);
          expect(mensagem.payload).not.toHaveProperty('pecasUtilizadas');
          expect(mensagem.payload).not.toHaveProperty('fatoTerminalEventId');
          expect(
            await c.jornada.caixa.contar(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
          ).toBe(0);
          expect(await consumoDa(c)).toBeNull();
          expect([
            StatusOS.EM_CANCELAMENTO,
            StatusOS.CANCELADA,
          ] as string[]).toContain(await c.jornada.status());
        },
      );

      it('execution.resposta-cancelamento-cancelada-sem-existir.v1 segue ao financeiro sem consumo', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-cancelada-sem-existir.v1',
        );
        expect(await consumoDa(c)).toBeNull();
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          1,
        );
        expect(await inventarioAberto(c)).toHaveLength(0);
      });

      it('execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1 segue ao financeiro sem consumo', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
        );
        expect(await consumoDa(c)).toBeNull();
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          1,
        );
        expect(await inventarioAberto(c)).toHaveLength(0);
      });

      it('execution.resposta-cancelamento-interrupcao-solicitada-reparo.v1 espera o ReparoInterrompido', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-interrupcao-solicitada-reparo.v1',
        );
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
        expect(await consumoDa(c)).toBeNull();
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          0,
        );
        expect(await estoqueDaPeca(ambiente.prisma, c.pecaA.id)).toEqual({
          fisico: 10,
          reservado: 2,
        });
      });

      it('execution.resposta-cancelamento-ja-concluida-reparo.v1 usa o fato terminal como identidade do consumo e avalia a exceção E10', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        const resposta = await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-ja-concluida-reparo.v1',
        );
        const fatoTerminalEventId = resposta.payload
          .fatoTerminalEventId as string;
        expect(fatoTerminalEventId).not.toBe(resposta.eventId);
        const consumo = await consumoDa(c);
        expect(consumo).toMatchObject({
          eventId: fatoTerminalEventId,
          tipoFato: 'REPARO_CONCLUIDO',
          responsavelId: 'mecanico-1',
        });
        expect(consumo?.concluidoEm?.toISOString()).toBe(
          resposta.payload.concluidaEm,
        );
        // Transporte: só o eventId do envelope marca a mensagem como processada.
        expect(
          await ambiente.prisma.mensagemProcessada.count({
            where: { eventId: resposta.eventId },
          }),
        ).toBe(1);
        expect(
          await ambiente.prisma.mensagemProcessada.count({
            where: { eventId: fatoTerminalEventId },
          }),
        ).toBe(0);
        const consultas = await c.jornada.caixa.emitidos(
          COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
        );
        expect(consultas).toHaveLength(1);
        expect(consultas[0].payload).toMatchObject({
          finalidade: 'EXCECAO_E10',
        });
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
      });

      it('execution.resposta-cancelamento-ja-encerrada-reparo-falhou.v1 reconcilia com a auditoria original e segue ao financeiro', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        const resposta = await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-ja-encerrada-reparo-falhou.v1',
        );
        expect(await consumoDa(c)).toMatchObject({
          eventId: resposta.payload.fatoTerminalEventId,
          tipoFato: 'REPARO_FALHOU',
          responsavelId: 'mecanico-1',
        });
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          1,
        );
        expect(
          await c.jornada.caixa.contar(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
        ).toBe(0);
      });

      it('execution.resposta-cancelamento-ja-encerrada-reparo-interrompido.v1 reconcilia, libera a reserva e segue ao financeiro', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        const resposta = await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-ja-encerrada-reparo-interrompido.v1',
        );
        expect(await consumoDa(c)).toMatchObject({
          eventId: resposta.payload.fatoTerminalEventId,
          tipoFato: 'REPARO_INTERROMPIDO',
        });
        expect(await estoqueDaPeca(ambiente.prisma, c.pecaA.id)).toEqual({
          fisico: 10,
          reservado: 0,
        });
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          1,
        );
      });

      it('execution.resposta-cancelamento-retrocompatibilidade.v1 abre pendência de informação insuficiente, sem consumo nem erro', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-retrocompatibilidade.v1',
        );
        const [pendencia] = await inventarioAberto(c);
        expect(pendencia.detalhes).toMatchObject({
          natureza: 'INFORMACAO_INSUFICIENTE',
        });
        expect(await consumoDa(c)).toBeNull();
        expect(await c.jornada.status()).toBe(StatusOS.EM_CANCELAMENTO);
        expect(await c.jornada.caixa.contar(COMANDO_CANCELAR_FINANCEIRO)).toBe(
          0,
        );
      });

      it('resposta e fato terminal do mesmo acontecimento convergem para um único consumo', async () => {
        const c = await ordemEm('CANCELAMENTO_COM_REPARO');
        const resposta = await entregar(
          c,
          'execution',
          'execution.resposta-cancelamento-ja-encerrada-reparo-falhou.v1',
        );
        const fato = instanciarExemplo(
          'execution',
          'execution.reparo-falhou.v1',
          {
            ordemServicoId: c.jornada.ordemServicoId,
            correlationId: c.jornada.correlationId,
            substituicoes: {
              '550e8400-e29b-41d4-a716-446655440017': resposta.payload
                .fatoTerminalEventId as string,
            },
          },
        );
        expect(fato.eventId).toBe(resposta.payload.fatoTerminalEventId);
        await c.jornada.entregar(fato);
        expect(
          await ambiente.prisma.consumoAplicadoOs.count({
            where: { ordemServicoId: c.jornada.ordemServicoId },
          }),
        ).toBe(1);
      });
    });

    describe('comandos emitidos pelo OS no formato dos exemplos', () => {
      it('os seis comandos têm o formato publicado pelo dono do contrato', async () => {
        const c = await ordemEm('CONSULTA_FINANCEIRA');
        const comandosEmitidos = await c.jornada.caixa.emitidos();
        const tipoDe = (tipo: string) =>
          comandosEmitidos.find((envelope) => envelope.eventType === tipo)!;
        verificarFormatoDoComando(
          'execution',
          'execution.iniciar-diagnostico.v1',
          tipoDe(COMANDO_INICIAR_DIAGNOSTICO),
        );
        verificarFormatoDoComando(
          'billing',
          'billing.gerar-orcamento.v1',
          tipoDe(COMANDO_GERAR_ORCAMENTO),
        );
        verificarFormatoDoComando(
          'billing',
          'billing.consultar-situacao-financeira.v1',
          tipoDe(COMANDO_CONSULTAR_SITUACAO_FINANCEIRA),
        );

        const pago = await ordemEm('AGUARDANDO_EXECUCAO');
        verificarFormatoDoComando(
          'execution',
          'execution.iniciar-reparo.v1',
          (await pago.jornada.caixa.emitidos(COMANDO_INICIAR_REPARO))[0],
        );

        const emExecucao = await ordemEm('CANCELAMENTO_COM_REPARO');
        const cancelarTarefa = (
          await emExecucao.jornada.caixa.emitidos(COMANDO_CANCELAR_TAREFA)
        )[0];
        verificarFormatoDoComando(
          'execution',
          'execution.cancelar-tarefa.v1',
          cancelarTarefa,
        );

        const financeiro = await ordemEm('CANCELAMENTO_NO_FINANCEIRO');
        verificarFormatoDoComando(
          'billing',
          'billing.cancelar-financeiro.v1',
          (
            await financeiro.jornada.caixa.emitidos(COMANDO_CANCELAR_FINANCEIRO)
          )[0],
        );
      });
    });

    it('cada exemplo recebido pelo OS tem processador registrado', () => {
      const processadores = ambiente.app.get<ProcessadorMensagem[]>(
        PROCESSADORES_MENSAGEM,
      );
      const tipos = new Set(processadores.map((p) => p.eventType));
      for (const servico of ['billing', 'execution'] as const) {
        for (const [nome, direcao] of Object.entries(INVENTARIO[servico])) {
          if (direcao === 'RECEBIDA_PELO_OS') {
            expect(tipos).toContain(
              carregarExemplo(servico, nome).envelope.eventType,
            );
          }
        }
      }
    });
  });
});
