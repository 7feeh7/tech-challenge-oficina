import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { OrdemServicoOutput } from '../mappers/ordem-servico-output.mapper';
import { MudancaOrdemServicoUseCase } from './mudanca-ordem-servico.use-case';

export interface AtualizarOrdemServicoInput {
  descricaoProblema?: string;
}

/** O PATCH público só corrige a descrição, antes do diagnóstico (D2.22). */
export class AtualizarOrdemServicoUseCase extends MudancaOrdemServicoUseCase {
  constructor(
    ordens: OrdemServicoGateway,
    unitOfWork: UnitOfWork,
    transicoes: TransicaoOrdemServicoService,
  ) {
    super(ordens, unitOfWork, transicoes);
  }

  async execute(
    id: string,
    input: AtualizarOrdemServicoInput,
  ): Promise<OrdemServicoOutput> {
    return await this.aplicarMudanca({
      ordemServicoId: id,
      aplicar: (ordem) => {
        if (input.descricaoProblema !== undefined) {
          ordem.alterarDescricaoProblema(input.descricaoProblema);
        }
      },
    });
  }
}
