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
   * Aprovação do cliente: o Billing pede a reserva pela rota interna do OS.
   * Aceita qualquer 2xx porque o OS responde 201 e o Billing só trata 200 como
   * sucesso (impedimento da E32, fora do que esta suíte decide).
   */
  async aprovarOrcamento(rodada = 1, tentativaAprovacao = 1) {
    const resposta = await this.jornada.ambiente
      .comoBilling(
        `/internal/ordens-servico/${this.jornada.ordemServicoId}/reservas`,
        `reserva:${this.orcamentoId}:${tentativaAprovacao}`,
        this.jornada.correlationId,
      )
      .send({ rodada, orcamentoId: this.orcamentoId });
    if (resposta.status < 200 || resposta.status >= 300) {
      throw new Error(
        `Reserva recusada pelo OS: ${resposta.status} ${JSON.stringify(resposta.body)}`,
      );
    }
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

  /** Sem cobrança criada antes, a cobrança é gerada só para identificar o pagamento. */
  async confirmarPagamento(rodada = 1): Promise<EnvelopeMensagem> {
    this.cobranca ??= this.novaCobranca();
    const cobranca = this.cobranca;
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

export type RespostaDeCancelamentoDaTarefa =
  | 'REPARO_CANCELADO_SEM_INICIO'
  | 'DIAGNOSTICO_JA_CONCLUIDO';

const EXEMPLO_DA_RESPOSTA: Record<RespostaDeCancelamentoDaTarefa, string> = {
  REPARO_CANCELADO_SEM_INICIO:
    'execution.resposta-cancelamento-cancelada-sem-inicio-reparo.v1',
  DIAGNOSTICO_JA_CONCLUIDO:
    'execution.resposta-cancelamento-ja-concluida-diagnostico.v1',
};

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
   * Conclusão do diagnóstico pela porta interna do OS, com o `tarefaId`
   * composto que o Execution envia. Entra pelo caso de uso porque o DTO da
   * rota exige UUID e recusaria esse formato real (impedimento da E32).
   */
  async concluirDiagnostico(
    itens: { tipo: 'PECA' | 'SERVICO'; itemId: string; quantidade: number }[],
    laudo: string,
    rodada = 1,
  ) {
    const tarefaId = this.tarefaId(rodada, 'DIAGNOSTICO');
    return await this.jornada.ambiente.concluirDiagnosticoNoOs.execute({
      ordemServicoId: this.jornada.ordemServicoId,
      rodada,
      tarefaId,
      laudo,
      itens,
      idempotencyKey: `diagnostico:${tarefaId}`,
    });
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

  async responderCancelamentoDaTarefa(
    resposta: RespostaDeCancelamentoDaTarefa,
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
    const agora = new Date().toISOString();
    await this.jornada.entregar(
      this.mensagem(
        EXEMPLO_DA_RESPOSTA[resposta],
        comando.eventId,
        {
          payload:
            resposta === 'REPARO_CANCELADO_SEM_INICIO'
              ? { encerradaEm: agora }
              : { encerradaEm: agora, concluidaEm: agora },
        },
        rodada,
      ),
    );
    return comando;
  }
}
