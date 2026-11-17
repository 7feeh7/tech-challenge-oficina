import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { OrdemServicoOutput } from '../mappers/ordem-servico-output.mapper';
import { MudancaOrdemServicoUseCase } from './mudanca-ordem-servico.use-case';

/** Entrega em `FINALIZADA` ou devolução física em cancelamento (D2.6). */
export class RegistrarRetiradaUseCase extends MudancaOrdemServicoUseCase {
  constructor(
    ordens: OrdemServicoGateway,
    unitOfWork: UnitOfWork,
    transicoes: TransicaoOrdemServicoService,
  ) {
    super(ordens, unitOfWork, transicoes);
  }

  async execute(id: string): Promise<OrdemServicoOutput> {
    return await this.aplicarMudanca({
      ordemServicoId: id,
      aplicar: (ordem, ocorridoEm) => ordem.registrarRetirada(ocorridoEm),
      observacao: 'Retirada do veículo',
    });
  }
}
