import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type {
  PassoCompensacaoSaga,
  ResultadoExecucaoCompensacao,
} from '@/shared/generated/prisma/enums';
import type { CondicoesExcecaoE10 } from '../../domain/consulta-financeira';

export interface ItemQuantidadeExecucao {
  itemId: string;
  quantidade: number;
}

export interface EstadoCompensacaoSnapshot {
  ordemServicoId: string;
  rodada: number;
  passo: PassoCompensacaoSaga;
  resultadoExecucao: ResultadoExecucaoCompensacao | null;
  consultaIdVigente: string | null;
  aguardandoResposta: boolean;
  reparoIniciadoDuranteCancelamento: boolean;
  fatoTerminalExecucao: boolean;
  pecasUtilizadas: ItemQuantidadeExecucao[] | null;
  condicoesE10: CondicoesExcecaoE10 | null;
}

export interface EstadoCompensacaoGateway {
  obterOuCriar(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
  ): Promise<EstadoCompensacaoSnapshot>;

  salvar(
    contexto: ContextoTransacao,
    estado: EstadoCompensacaoSnapshot,
  ): Promise<void>;
}
