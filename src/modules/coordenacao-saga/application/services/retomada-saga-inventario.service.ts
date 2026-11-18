import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { OrdemServicoGateway } from '@/modules/ordens-servico/application/ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import { NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO } from '../../domain/natureza-pendencia-financeira';
import type { CompensacaoSagaService } from './compensacao-saga.service';

export class RetomadaSagaInventarioService {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly transicoes: TransicaoOrdemServicoService,
    private readonly compensacao: CompensacaoSagaService,
    private readonly prisma: PrismaService,
  ) {}

  async retomarAposResolucaoInventario(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    causationId: string,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const pendenciasAbertas = await cliente.pendenciaOs.count({
      where: {
        ordemServicoId,
        tipo: TipoPendenciaOs.INVENTARIO,
        resolvida: false,
      },
    });
    if (pendenciasAbertas > 0) {
      return;
    }

    const bloqueada = await this.ordens.bloquearParaAtualizacao(
      contexto,
      ordemServicoId,
    );
    if (!bloqueada) {
      return;
    }

    const consumo = await cliente.consumoAplicadoOs.findUnique({
      where: {
        ordemServicoId_rodada: {
          ordemServicoId,
          rodada: bloqueada.ordem.rodadaVigente,
        },
      },
    });
    if (!consumo) {
      return;
    }

    if (consumo.situacaoReconciliacao === 'DIVERGENCIA_PENDENTE') {
      await cliente.consumoAplicadoOs.update({
        where: { id: consumo.id },
        data: { situacaoReconciliacao: 'DIVERGENCIA_RESOLVIDA' },
      });
    }

    if (
      bloqueada.ordem.status === StatusOS.EM_EXECUCAO &&
      consumo.aguardandoFinalizacao &&
      consumo.tipoFato === 'REPARO_CONCLUIDO'
    ) {
      const naoInventario = {
        ordemServicoId,
        resolvida: false,
        tipo: { not: TipoPendenciaOs.INVENTARIO },
      };
      const abertas = await cliente.pendenciaOs.count({ where: naoInventario });
      // Contagem positiva por natureza: o filtro JSON negado descartaria a
      // pendência sem `natureza` em `detalhes`, que precisa continuar bloqueando.
      const informativas = await cliente.pendenciaOs.count({
        where: {
          ...naoInventario,
          detalhes: {
            path: ['natureza'],
            equals: NATUREZA_PENDENCIA_SEGUNDO_PAGAMENTO,
          },
        },
      });
      if (abertas - informativas > 0) {
        return;
      }
      const quando = consumo.concluidoEm ?? consumo.fatoOcorridoEm;
      await this.transicoes.aplicar(contexto, {
        ordemServicoId,
        aplicar: (os, horario) => {
          if (os.status === StatusOS.AGUARDANDO_EXECUCAO) {
            os.registrarReparoIniciado(horario);
          }
          os.registrarReparoConcluido(horario);
        },
        ocorridoEm: quando,
        observacao: 'Retomada da finalização após inventário',
      });
      await cliente.consumoAplicadoOs.update({
        where: { id: consumo.id },
        data: { aguardandoFinalizacao: false },
      });
      return;
    }

    if (bloqueada.ordem.status === StatusOS.EM_CANCELAMENTO) {
      await this.compensacao.avancarSeEmCancelamento(
        contexto,
        ordemServicoId,
        causationId,
      );
    }
  }
}
