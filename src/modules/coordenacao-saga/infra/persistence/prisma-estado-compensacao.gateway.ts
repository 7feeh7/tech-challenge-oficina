import { Injectable } from '@nestjs/common';
import {
  PassoCompensacaoSaga,
  type ResultadoExecucaoCompensacao,
} from '@/shared/generated/prisma/enums';
import { obterClienteTransacao } from '@/shared/database/obter-cliente-transacao';
import { PrismaService } from '@/shared/database/prisma.service';
import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type { CondicoesExcecaoE10 } from '../../domain/consulta-financeira';
import type {
  EstadoCompensacaoGateway,
  EstadoCompensacaoSnapshot,
  ItemQuantidadeExecucao,
} from '../../application/ports/estado-compensacao.gateway';

function mapPecas(valor: unknown): ItemQuantidadeExecucao[] | null {
  if (!Array.isArray(valor)) {
    return null;
  }
  return valor as ItemQuantidadeExecucao[];
}

function mapCondicoes(valor: unknown): CondicoesExcecaoE10 | null {
  if (!valor || typeof valor !== 'object') {
    return null;
  }
  return valor as CondicoesExcecaoE10;
}

@Injectable()
export class PrismaEstadoCompensacaoGateway implements EstadoCompensacaoGateway {
  constructor(private readonly prisma: PrismaService) {}

  private toSnapshot(registro: {
    ordemServicoId: string;
    rodada: number;
    passo: PassoCompensacaoSaga;
    resultadoExecucao: ResultadoExecucaoCompensacao | null;
    consultaIdVigente: string | null;
    aguardandoResposta: boolean;
    reparoIniciadoDuranteCancelamento: boolean;
    fatoTerminalExecucao: boolean;
    pecasUtilizadas: unknown;
    condicoesE10: unknown;
  }): EstadoCompensacaoSnapshot {
    return {
      ordemServicoId: registro.ordemServicoId,
      rodada: registro.rodada,
      passo: registro.passo,
      resultadoExecucao: registro.resultadoExecucao,
      consultaIdVigente: registro.consultaIdVigente,
      aguardandoResposta: registro.aguardandoResposta,
      reparoIniciadoDuranteCancelamento:
        registro.reparoIniciadoDuranteCancelamento,
      fatoTerminalExecucao: registro.fatoTerminalExecucao,
      pecasUtilizadas: mapPecas(registro.pecasUtilizadas),
      condicoesE10: mapCondicoes(registro.condicoesE10),
    };
  }

  async obterOuCriar(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<EstadoCompensacaoSnapshot> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    const existente = await cliente.estadoCompensacaoOs.findUnique({
      where: { ordemServicoId },
    });
    if (existente) {
      return this.toSnapshot(existente);
    }
    const criado = await cliente.estadoCompensacaoOs.create({
      data: {
        ordemServicoId,
        rodada,
        passo: PassoCompensacaoSaga.EXECUCAO,
      },
    });
    return this.toSnapshot(criado);
  }

  async salvar(
    contexto: ContextoTransacao,
    estado: EstadoCompensacaoSnapshot,
  ): Promise<void> {
    const cliente = obterClienteTransacao(contexto, this.prisma);
    await cliente.estadoCompensacaoOs.update({
      where: { ordemServicoId: estado.ordemServicoId },
      data: {
        rodada: estado.rodada,
        passo: estado.passo,
        resultadoExecucao: estado.resultadoExecucao,
        consultaIdVigente: estado.consultaIdVigente,
        aguardandoResposta: estado.aguardandoResposta,
        reparoIniciadoDuranteCancelamento:
          estado.reparoIniciadoDuranteCancelamento,
        fatoTerminalExecucao: estado.fatoTerminalExecucao,
        pecasUtilizadas: (estado.pecasUtilizadas ?? undefined) as never,
        condicoesE10: (estado.condicoesE10 ?? undefined) as never,
      },
    });
  }
}
