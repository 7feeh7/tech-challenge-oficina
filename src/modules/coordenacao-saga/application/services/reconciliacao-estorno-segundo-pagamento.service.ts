import { randomUUID } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { obterInstanteBanco } from '@/shared/database/obter-instante-banco';
import { PrismaService } from '@/shared/database/prisma.service';
import type { PendenciaOs } from '@/shared/generated/prisma/client';
import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import { ErroMensagemPermanente } from '@/shared/messaging/domain/mensageria.errors';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  deveGravarEvidenciaEstorno,
  montarEvidenciaEstorno,
  type EstornoConcluidoPayload,
  type EvidenciaEstornoBilling,
} from '../../domain/estorno-segundo-pagamento';
import {
  CHAVE_EVIDENCIA_ESTORNO_BILLING,
  CHAVE_PAGAMENTO_CONFIRMADO_POSTERIOR,
  NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO,
} from '../../domain/natureza-pendencia-financeira';

interface PagamentoConfirmadoPayload {
  cobrancaId?: string;
  orderId: string;
  valorCentavos?: number;
}

// Com a OS já cancelada ou entregue o segundo pagamento não tem mais o que
// aguardar: a pendência da order nasce, ou passa, resolvida.
const STATUS_QUE_RESOLVEM_PENDENCIA = [StatusOS.CANCELADA, StatusOS.ENTREGUE];

type PendenciaDaOrder = PendenciaOs;

/**
 * Reconcilia `EstornoConcluido` (`origemEstorno = SEGUNDO_PAGAMENTO`) e o
 * `PagamentoConfirmado` da mesma order em qualquer ordem de chegada. A
 * correspondência é por OS, rodada e `orderId`: nunca toca outra pendência, o
 * status, o estoque nem a compensação.
 */
export class ReconciliacaoEstornoSegundoPagamentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLoggerService,
  ) {}

  /** Há evidência de estorno de segundo pagamento gravada para a order na rodada. */
  async possuiEvidenciaDaOrder(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    orderId: string,
  ): Promise<boolean> {
    const pendencia = await this.buscarPendenciaDaOrder(
      contexto,
      ordemServicoId,
      rodada,
      orderId,
    );
    if (!pendencia) {
      return false;
    }
    return Boolean(this.detalhesDe(pendencia)[CHAVE_EVIDENCIA_ESTORNO_BILLING]);
  }

  async registrarEstorno(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    status: StatusOS,
    orderRegistradaComoPaga: boolean,
  ): Promise<void> {
    const payload = envelope.payload as EstornoConcluidoPayload;
    const pendencia = await this.buscarPendenciaDaOrder(
      contexto,
      envelope.ordemServicoId,
      envelope.rodada,
      payload.orderId!,
    );
    if (!pendencia) {
      await this.criarPendenciaComEvidencia(
        contexto,
        envelope,
        status,
        orderRegistradaComoPaga,
      );
      return;
    }
    this.exigirCobrancaCoerente(pendencia, payload.cobrancaId);
    await this.completarPendenciaExistente(
      contexto,
      pendencia,
      envelope,
      status,
    );
  }

  /** Completa a pendência da order com o pagamento que chegou depois do estorno. */
  async registrarPagamentoPosterior(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    payload: PagamentoConfirmadoPayload,
  ): Promise<void> {
    const pendencia = await this.buscarPendenciaDaOrder(
      contexto,
      envelope.ordemServicoId,
      envelope.rodada,
      payload.orderId,
    );
    if (!pendencia) {
      return;
    }
    this.exigirCobrancaCoerente(pendencia, payload.cobrancaId);
    const detalhes = this.detalhesDe(pendencia);
    // Reentrega e duplicata do pagamento não reescrevem o que já foi registrado.
    if (detalhes[CHAVE_PAGAMENTO_CONFIRMADO_POSTERIOR]) {
      return;
    }
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.pendenciaOs.update({
      where: { id: pendencia.id },
      data: {
        detalhes: {
          ...detalhes,
          ...(detalhes.cobrancaId || !payload.cobrancaId
            ? {}
            : { cobrancaId: payload.cobrancaId }),
          [CHAVE_PAGAMENTO_CONFIRMADO_POSTERIOR]: {
            eventId: envelope.eventId,
            cobrancaId: payload.cobrancaId,
            valorCentavos: payload.valorCentavos,
          },
        },
      },
    });
  }

  private async buscarPendenciaDaOrder(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    orderId: string,
  ): Promise<PendenciaDaOrder | null> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    return cliente.pendenciaOs.findFirst({
      where: {
        ordemServicoId,
        rodada,
        tipo: TipoPendenciaOs.FINANCEIRA,
        detalhes: { path: ['orderId'], equals: orderId },
      },
      orderBy: { criadoEm: 'asc' },
    });
  }

  private async criarPendenciaComEvidencia(
    contexto: ContextoTransacao,
    envelope: EnvelopeMensagem,
    status: StatusOS,
    orderRegistradaComoPaga: boolean,
  ): Promise<void> {
    const payload = envelope.payload as EstornoConcluidoPayload;
    if (orderRegistradaComoPaga) {
      // Caso fora do alcance: a OS aceitou essa order como o pagamento antes
      // de saber que era o segundo. A evidência fica registrada, nada é
      // compensado e a ocorrência fica visível para tratamento manual.
      this.logger.logWithMeta(
        'warn',
        'saga.estorno-segundo-pagamento.order-aceita-como-pagamento',
        {
          eventId: envelope.eventId,
          orderId: payload.orderId,
          cobrancaId: payload.cobrancaId,
          status,
          rodada: envelope.rodada,
        },
        'CoordenacaoSaga',
      );
    }
    const resolvida = STATUS_QUE_RESOLVEM_PENDENCIA.includes(status);
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.pendenciaOs.create({
      data: {
        id: randomUUID(),
        ordemServicoId: envelope.ordemServicoId,
        rodada: envelope.rodada,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida,
        resolvidaEm: resolvida
          ? await obterInstanteBanco(contexto, this.prisma)
          : null,
        detalhes: {
          natureza: NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO,
          orderId: payload.orderId,
          ...(payload.cobrancaId ? { cobrancaId: payload.cobrancaId } : {}),
          eventId: envelope.eventId,
          motivo:
            'Estorno do segundo pagamento antes da confirmação do pagamento',
          [CHAVE_EVIDENCIA_ESTORNO_BILLING]: montarEvidenciaEstorno(
            envelope.eventId,
            payload,
          ),
        },
      },
    });
  }

  private async completarPendenciaExistente(
    contexto: ContextoTransacao,
    pendencia: PendenciaDaOrder,
    envelope: EnvelopeMensagem,
    status: StatusOS,
  ): Promise<void> {
    const detalhes = this.detalhesDe(pendencia);
    const evidenciaAtual = detalhes[CHAVE_EVIDENCIA_ESTORNO_BILLING] as
      | Partial<EvidenciaEstornoBilling>
      | undefined;
    const gravarEvidencia = deveGravarEvidenciaEstorno(
      evidenciaAtual,
      envelope.eventId,
    );
    const resolver =
      !pendencia.resolvida && STATUS_QUE_RESOLVEM_PENDENCIA.includes(status);
    // O pagamento de CANCELADA e ENTREGUE abre a pendência sem natureza (pode ser
    // o legítimo atrasado); a evidência do Billing confirma que é o segundo.
    const classificar = !detalhes.natureza;
    if (!gravarEvidencia && !resolver && !classificar) {
      return;
    }
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.pendenciaOs.update({
      where: { id: pendencia.id },
      data: {
        ...(gravarEvidencia || classificar
          ? {
              detalhes: {
                ...detalhes,
                ...(classificar
                  ? { natureza: NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO }
                  : {}),
                ...(gravarEvidencia
                  ? {
                      [CHAVE_EVIDENCIA_ESTORNO_BILLING]: montarEvidenciaEstorno(
                        envelope.eventId,
                        envelope.payload as EstornoConcluidoPayload,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
        ...(resolver
          ? {
              resolvida: true,
              resolvidaEm: await obterInstanteBanco(contexto, this.prisma),
            }
          : {}),
      },
    });
  }

  // Ausência da cobrança em um dos lados não é divergência: só dois valores
  // presentes e diferentes indicam que o fato não é desta pendência.
  private exigirCobrancaCoerente(
    pendencia: PendenciaDaOrder,
    cobrancaIdDoFato: string | undefined,
  ): void {
    const cobrancaIdGravada = this.detalhesDe(pendencia).cobrancaId;
    if (
      cobrancaIdGravada &&
      cobrancaIdDoFato &&
      cobrancaIdGravada !== cobrancaIdDoFato
    ) {
      throw new ErroMensagemPermanente(
        'cobrancaId do fato diverge do cobrancaId da pendência da mesma order.',
      );
    }
  }

  private detalhesDe(pendencia: PendenciaDaOrder): Record<string, unknown> {
    return pendencia.detalhes as Record<string, unknown>;
  }
}
