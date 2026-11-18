import { randomUUID } from 'node:crypto';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  COMANDO_GERAR_ORCAMENTO,
  COMANDO_INICIAR_DIAGNOSTICO,
  COMANDO_INICIAR_REPARO,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import type { JornadaOs } from './jornada-os';
import {
  montarMensagemDoExemplo,
  verificarFormatoDoComando,
  type ConteudoDaMensagem,
} from './mensagens-do-exemplo';

interface ItemOrcamento {
  quantidade: number;
  precoUnitarioCentavos: number;
}

export interface CobrancaSimulada {
  cobrancaId: string;
  orderId: string;
  valorCentavos: number;
  prazoPagamento: string;
}

export type SituacaoDePagamento =
  | 'PAGO_NO_PRAZO'
  | 'SEM_PAGAMENTO'
  | 'INDETERMINADA';

export type ResultadoFinanceiro =
  | 'NADA_A_CANCELAR'
  | 'CANCELADA'
  | 'ESTORNADA'
  | 'PENDENCIA_MANUAL_ABERTA';

/**
 * Billing simulado só nas portas: recebe os comandos que o OS deixou na
 * outbox, usa a porta HTTP interna de reserva e responde com mensagens no
 * formato dos exemplos publicados pelo Billing (`568e04e`).
 */
export class BillingSimulado {
  orcamentoId?: string;
  valorTotalCentavos = 0;
  cobranca?: CobrancaSimulada;

  constructor(private readonly jornada: JornadaOs) {}

  private mensagem(
    nomeExemplo: string,
    causationId: string | null,
    conteudo: ConteudoDaMensagem,
    rodada: number,
  ): EnvelopeMensagem {
    return montarMensagemDoExemplo(
      'billing',
      nomeExemplo,
      {
        ordemServicoId: this.jornada.ordemServicoId,
        correlationId: this.jornada.correlationId,
        rodada,
        causationId,
      },
      conteudo,
    );
  }

  async gerarOrcamento(rodada = 1): Promise<string> {
    const comando = await this.jornada.caixa.receberProximo(
      COMANDO_GERAR_ORCAMENTO,
    );
    verificarFormatoDoComando('billing', 'billing.gerar-orcamento.v1', comando);
    const itens = (comando.payload as { itens: ItemOrcamento[] }).itens;
    this.valorTotalCentavos = itens.reduce(
      (soma, item) => soma + item.quantidade * item.precoUnitarioCentavos,
      0,
    );
    this.orcamentoId = randomUUID();
    await this.jornada.entregar(
      this.mensagem(
        'billing.orcamento-gerado.v1',
        comando.eventId,
        {
          payload: {
            orcamentoId: this.orcamentoId,
            valorTotalCentavos: this.valorTotalCentavos,
          },
        },
        rodada,
      ),
    );
    return this.orcamentoId;
  }

  async rejeitarOrcamento(
    motivo: string,
    rodada = 1,
  ): Promise<EnvelopeMensagem> {
    const mensagem = this.mensagem(
      'billing.orcamento-rejeitado.v1',
      null,
      { payload: { orcamentoId: this.orcamentoId, motivo } },
      rodada,
    );
    await this.jornada.entregar(mensagem);
    return mensagem;
  }

  /**
   * Aprovação do cliente: o Billing pede a reserva pela rota interna do OS e
   * só trata o status 200 como sucesso (03-service-boundaries).
   */
  async aprovarOrcamento(rodada = 1, tentativaAprovacao = 1) {
    const resposta = await this.jornada.ambiente
      .comoBilling(
        `/internal/ordens-servico/${this.jornada.ordemServicoId}/reservas`,
        `reserva:${this.orcamentoId}:${tentativaAprovacao}`,
        this.jornada.correlationId,
      )
      .send({ rodada, orcamentoId: this.orcamentoId })
      .expect(200);
    return resposta.body as { reservaId: string; prazoReferencia: string };
  }

  private novaCobranca(): CobrancaSimulada {
    return {
      cobrancaId: randomUUID(),
      orderId: `ORDTST${randomUUID().replace(/-/g, '').toUpperCase().slice(0, 26)}`,
      valorCentavos: this.valorTotalCentavos,
      prazoPagamento: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }

  async criarCobranca(rodada = 1): Promise<EnvelopeMensagem> {
    const cobranca = this.novaCobranca();
    this.cobranca = cobranca;
    const mensagem = this.mensagem(
      'billing.cobranca-criada.v1',
      null,
      {
        payload: {
          ...cobranca,
          linkPagamento: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${cobranca.orderId}`,
        },
      },
      rodada,
    );
    await this.jornada.entregar(mensagem);
    return mensagem;
  }

  /** O Billing só confirma o pagamento de uma cobrança que ele já criou. */
  async confirmarPagamento(rodada = 1): Promise<EnvelopeMensagem> {
    const cobranca = this.cobranca;
    if (!cobranca) {
      throw new Error('A cobrança precisa ser criada antes do pagamento.');
    }
    const mensagem = this.mensagem(
      'billing.pagamento-confirmado.v1',
      null,
      {
        payload: {
          cobrancaId: cobranca.cobrancaId,
          orderId: cobranca.orderId,
          aprovadoEm: new Date().toISOString(),
          valorCentavos: cobranca.valorCentavos,
        },
      },
      rodada,
    );
    await this.jornada.entregar(mensagem);
    return mensagem;
  }

  /**
   * Resposta à consulta do OS. O Billing só responde `SEM_PAGAMENTO` depois de
   * cancelar a order no Mercado Pago e nesse caso não informa aprovação nem
   * valor pago (`executar-consulta-situacao-financeiro.service.ts`).
   */
  async responderConsulta(
    situacao: SituacaoDePagamento,
    rodada = 1,
  ): Promise<EnvelopeMensagem> {
    const comando = await this.jornada.caixa.receberProximo(
      COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
    );
    verificarFormatoDoComando(
      'billing',
      'billing.consultar-situacao-financeira.v1',
      comando,
    );
    const cobranca = this.cobranca!;
    const pago = situacao === 'PAGO_NO_PRAZO';
    await this.jornada.entregar(
      this.mensagem(
        'billing.situacao-financeira.v1',
        comando.eventId,
        {
          payload: {
            consultaId: (comando.payload as { consultaId: string }).consultaId,
            situacaoPagamento: situacao,
            situacaoEstorno:
              situacao === 'INDETERMINADA' ? 'INDETERMINADO' : 'NENHUM',
            cobrancaId: cobranca.cobrancaId,
            orderId: cobranca.orderId,
            aprovadoEm: new Date().toISOString(),
            valorCentavos: cobranca.valorCentavos,
          },
          omitirDoPayload: pago ? [] : ['aprovadoEm', 'valorCentavos'],
        },
        rodada,
      ),
    );
    return comando;
  }

  async expirarCobranca(rodada = 1): Promise<void> {
    const cobranca = this.cobranca!;
    await this.jornada.entregar(
      this.mensagem(
        'billing.cobranca-expirada.v1',
        null,
        {
          payload: {
            cobrancaId: cobranca.cobrancaId,
            expiradaEm: new Date().toISOString(),
            orderId: cobranca.orderId,
          },
        },
        rodada,
      ),
    );
  }

  async responderCancelamentoFinanceiro(
    resultado: ResultadoFinanceiro,
    rodada = 1,
  ): Promise<EnvelopeMensagem> {
    const comando = await this.jornada.caixa.receberProximo(
      COMANDO_CANCELAR_FINANCEIRO,
    );
    verificarFormatoDoComando(
      'billing',
      'billing.cancelar-financeiro.v1',
      comando,
    );
    await this.jornada.entregar(
      this.mensagem(
        'billing.resposta-cancelamento-financeiro.v1',
        comando.eventId,
        { payload: { resultado, pendenciaId: null } },
        rodada,
      ),
    );
    return comando;
  }
}

export interface ConclusaoDeReparo {
  pecasUtilizadas: { itemId: string; quantidade: number }[];
  servicosRealizados?: { itemId: string; quantidade: number }[];
  divergencias?: Record<string, unknown>[];
  responsavelId?: string;
}

/**
 * Execution simulado só nas portas: recebe comandos pela outbox do OS,
 * conclui o diagnóstico pela porta interna e responde no formato dos
 * exemplos publicados pelo Execution (`b8d52c6`).
 */
export class ExecutionSimulado {
  constructor(private readonly jornada: JornadaOs) {}

  private tarefaId(rodada: number, tipo: 'DIAGNOSTICO' | 'REPARO'): string {
    return `${this.jornada.ordemServicoId}#${rodada}#${tipo}`;
  }

  private mensagem(
    nomeExemplo: string,
    causationId: string | null,
    conteudo: ConteudoDaMensagem,
    rodada: number,
  ): EnvelopeMensagem {
    return montarMensagemDoExemplo(
      'execution',
      nomeExemplo,
      {
        ordemServicoId: this.jornada.ordemServicoId,
        correlationId: this.jornada.correlationId,
        rodada,
        causationId,
      },
      conteudo,
    );
  }

  async iniciarDiagnostico(rodada = 1): Promise<EnvelopeMensagem> {
    const comando = await this.jornada.caixa.receberProximo(
      COMANDO_INICIAR_DIAGNOSTICO,
    );
    verificarFormatoDoComando(
      'execution',
      'execution.iniciar-diagnostico.v1',
      comando,
    );
    await this.jornada.entregar(
      this.mensagem(
        'execution.diagnostico-iniciado.v1',
        comando.eventId,
        {
          payload: {
            tarefaId: this.tarefaId(rodada, 'DIAGNOSTICO'),
            iniciadoEm: new Date().toISOString(),
          },
        },
        rodada,
      ),
    );
    return comando;
  }

  /**
   * Conclusão do diagnóstico pela rota interna do OS, com o `tarefaId`
   * composto e a chave de idempotência que o Execution envia.
   */
  async concluirDiagnostico(
    itens: { tipo: 'PECA' | 'SERVICO'; itemId: string; quantidade: number }[],
    laudo: string,
    rodada = 1,
  ) {
    const tarefaId = this.tarefaId(rodada, 'DIAGNOSTICO');
    const resposta = await this.jornada.ambiente
      .comoExecution(
        `/internal/ordens-servico/${this.jornada.ordemServicoId}/diagnostico`,
        `diagnostico:${tarefaId}`,
        this.jornada.correlationId,
      )
      .send({ rodada, tarefaId, laudo, itens })
      .expect(200);
    return resposta.body as { rodada: number; itensOficiais: unknown[] };
  }

  async iniciarReparo(rodada = 1): Promise<EnvelopeMensagem> {
    const comando = await this.jornada.caixa.receberProximo(
      COMANDO_INICIAR_REPARO,
    );
    verificarFormatoDoComando(
      'execution',
      'execution.iniciar-reparo.v1',
      comando,
    );
    await this.jornada.entregar(
      this.mensagem(
        'execution.reparo-iniciado.v1',
        comando.eventId,
        {
          payload: {
            tarefaId: this.tarefaId(rodada, 'REPARO'),
            iniciadoEm: new Date().toISOString(),
          },
        },
        rodada,
      ),
    );
    return comando;
  }

  async concluirReparo(
    conclusao: ConclusaoDeReparo,
    rodada = 1,
  ): Promise<EnvelopeMensagem> {
    const mensagem = this.mensagem(
      'execution.reparo-concluido-consumo-acima.v1',
      null,
      {
        payload: {
          tarefaId: this.tarefaId(rodada, 'REPARO'),
          concluidoEm: new Date().toISOString(),
          responsavelId: conclusao.responsavelId ?? 'mecanico-1',
          servicosRealizados: conclusao.servicosRealizados ?? [],
          pecasUtilizadas: conclusao.pecasUtilizadas,
          divergencias: conclusao.divergencias ?? [],
        },
      },
      rodada,
    );
    await this.jornada.entregar(mensagem);
    return mensagem;
  }

  /** Resposta do Execution a um `CancelarTarefa` de reparo que ainda não tinha começado. */
  async responderCancelamentoDoReparoNaoIniciado(
    rodada = 1,
  ): Promise<EnvelopeMensagem> {
    const comando = await this.jornada.caixa.receberProximo(
      COMANDO_CANCELAR_TAREFA,
    );
    verificarFormatoDoComando(
      'execution',
      'execution.cancelar-tarefa.v1',
      comando,
    );
    await this.jornada.entregar(
      this.mensagem(
        'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
        comando.eventId,
        { payload: { encerradaEm: new Date().toISOString() } },
        rodada,
      ),
    );
    return comando;
  }
}
