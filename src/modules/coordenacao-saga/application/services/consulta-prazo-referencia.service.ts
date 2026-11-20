import { randomUUID } from 'crypto';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { obterInstanteBanco } from '@/shared/database/obter-instante-banco';
import { PrismaService } from '@/shared/database/prisma.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import {
  PassoCompensacaoSaga,
  TipoPedidoSaga,
  TipoPendenciaOs,
} from '@/shared/generated/prisma/enums';
import {
  consultaIdPrazoReferencia,
  FinalidadeConsultaFinanceira,
} from '../../domain/consulta-financeira';
import type { ComandosSagaOutboxService } from './comandos-saga-outbox.service';
import type { EstadoCompensacaoGateway } from '../ports/estado-compensacao.gateway';
import type { PedidoEmitidoGateway } from '../ports/pedido-emitido.gateway';

export class ConsultaPrazoReferenciaService {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly estado: EstadoCompensacaoGateway,
    private readonly comandos: ComandosSagaOutboxService,
    private readonly pedidos: PedidoEmitidoGateway,
    private readonly prisma: PrismaService,
    private readonly intervaloReconsultaCiclos: number,
    private readonly intervaloVerificadorMs: number,
  ) {}

  async emitirConsultaVigente(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
    forcarNovaTentativa: boolean,
  ): Promise<'emitida' | 'ignorada' | 'indisponivel'> {
    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada) {
      return 'indisponivel';
    }

    if (bloqueada.ordem.status === StatusOS.EM_CANCELAMENTO) {
      const snapshot = await this.estado.obterOuCriar(
        contexto,
        ordemServicoId,
        bloqueada.ordem.rodadaVigente,
      );
      if (
        snapshot.passo !== PassoCompensacaoSaga.CONSULTA_E10 ||
        !snapshot.consultaIdVigente
      ) {
        return 'indisponivel';
      }
      await this.comandos.emitirConsultarSituacaoFinanceira(
        contexto,
        bloqueada,
        causationId,
        snapshot.consultaIdVigente,
        FinalidadeConsultaFinanceira.EXCECAO_E10,
      );
      return 'emitida';
    }

    if (bloqueada.ordem.status !== StatusOS.AGUARDANDO_PAGAMENTO) {
      return 'indisponivel';
    }

    const agora = await obterInstanteBanco(contexto, this.prisma);
    if (
      !bloqueada.ordem.prazoReferenciaReserva ||
      bloqueada.ordem.prazoReferenciaReserva.getTime() > agora.getTime()
    ) {
      return 'ignorada';
    }

    const cliente = obterClienteTransacao(contexto, this.prisma);
    const atual = await cliente.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: {
        consultaPrazoTentativa: true,
        consultaPrazoProximaEm: true,
      },
    });

    const consultaEmVoo = await this.pedidos.existeEmitido(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
      TipoPedidoSaga.CONSULTAR_SITUACAO_FINANCEIRA,
    );
    if (!forcarNovaTentativa && consultaEmVoo) {
      return 'ignorada';
    }

    if (
      !forcarNovaTentativa &&
      atual?.consultaPrazoProximaEm &&
      atual.consultaPrazoProximaEm.getTime() > agora.getTime()
    ) {
      return 'ignorada';
    }

    const tentativaAnterior = atual?.consultaPrazoTentativa ?? 0;
    const tentativa = forcarNovaTentativa
      ? tentativaAnterior + 1
      : tentativaAnterior === 0
        ? 1
        : tentativaAnterior + 1;

    const consultaId = consultaIdPrazoReferencia(
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
      tentativa,
    );

    const snapshot = await this.estado.obterOuCriar(
      contexto,
      ordemServicoId,
      bloqueada.ordem.rodadaVigente,
    );
    snapshot.consultaIdVigente = consultaId;
    await this.estado.salvar(contexto, snapshot);

    await cliente.ordemServico.update({
      where: { id: ordemServicoId },
      data: {
        consultaPrazoTentativa: tentativa,
        consultaPrazoProximaEm: new Date(
          agora.getTime() +
            this.intervaloVerificadorMs * this.intervaloReconsultaCiclos,
        ),
        consultaPrazoReivindicadoEm: null,
      },
    });

    const pendenciasConsulta = await cliente.pendenciaOs.findMany({
      where: {
        ordemServicoId,
        rodada: bloqueada.ordem.rodadaVigente,
        tipo: TipoPendenciaOs.FINANCEIRA,
        resolvida: false,
      },
    });
    const temConsulta = pendenciasConsulta.some((p) => {
      const det = p.detalhes as Record<string, unknown>;
      return det.natureza === 'CONSULTA_PRAZO_REFERENCIA';
    });
    if (!temConsulta) {
      await cliente.pendenciaOs.create({
        data: {
          id: randomUUID(),
          ordemServicoId,
          rodada: bloqueada.ordem.rodadaVigente,
          tipo: TipoPendenciaOs.FINANCEIRA,
          detalhes: {
            natureza: 'CONSULTA_PRAZO_REFERENCIA',
            consultaId,
          },
        },
      });
    }

    await this.comandos.emitirConsultarSituacaoFinanceira(
      contexto,
      bloqueada,
      causationId,
      consultaId,
      FinalidadeConsultaFinanceira.PRAZO_DE_REFERENCIA_VENCIDO,
    );

    return 'emitida';
  }

  async agendarProximaReconsulta(
    contexto: ContextoTransacao,
    ordemServicoId: string,
  ): Promise<void> {
    const agora = await obterInstanteBanco(contexto, this.prisma);
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.ordemServico.update({
      where: { id: ordemServicoId },
      data: {
        consultaPrazoProximaEm: new Date(
          agora.getTime() +
            this.intervaloVerificadorMs * this.intervaloReconsultaCiclos,
        ),
        consultaPrazoReivindicadoEm: null,
      },
    });
  }
}
