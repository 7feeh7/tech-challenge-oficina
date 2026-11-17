import { randomUUID } from 'crypto';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { ConsultaFinanceiraIndisponivelError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { ConsultaPrazoReferenciaService } from '../services/consulta-prazo-referencia.service';

export interface SolicitarConsultaFinanceiraOutput {
  resultado: 'emitida' | 'ignorada';
}

export class SolicitarConsultaFinanceiraUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly consulta: ConsultaPrazoReferenciaService,
  ) {}

  async execute(
    ordemServicoId: string,
  ): Promise<SolicitarConsultaFinanceiraOutput> {
    return this.unitOfWork.executar(async (contexto) => {
      const resultado = await this.consulta.emitirConsultaVigente(
        contexto,
        ordemServicoId,
        randomUUID(),
        true,
      );
      if (resultado === 'indisponivel') {
        throw new ConsultaFinanceiraIndisponivelError();
      }
      return { resultado };
    });
  }
}
