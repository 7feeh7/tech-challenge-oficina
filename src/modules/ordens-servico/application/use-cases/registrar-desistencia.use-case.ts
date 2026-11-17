import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { OrdemServicoOutput } from '../mappers/ordem-servico-output.mapper';
import { MudancaOrdemServicoUseCase } from './mudanca-ordem-servico.use-case';

export interface RegistrarDesistenciaInput {
  motivo: string;
}

/**
 * Leva a OS a `EM_CANCELAMENTO`. As compensações da saga que seguem a
 * desistência são da etapa E42; aqui só o estado e o aviso (exceção E8).
 */
export class RegistrarDesistenciaUseCase extends MudancaOrdemServicoUseCase {
  constructor(
    ordens: OrdemServicoGateway,
    unitOfWork: UnitOfWork,
    transicoes: TransicaoOrdemServicoService,
  ) {
    super(ordens, unitOfWork, transicoes);
  }

  async execute(
    id: string,
    input: RegistrarDesistenciaInput,
  ): Promise<OrdemServicoOutput> {
    return await this.aplicarMudanca({
      ordemServicoId: id,
      aplicar: (ordem, ocorridoEm) =>
        ordem.registrarDesistencia(input.motivo, ocorridoEm),
      motivo: input.motivo.trim(),
      observacao: 'Desistência registrada',
    });
  }
}
