import { randomUUID } from 'crypto';
import type { CompensacaoAvancoPort } from '@/shared/saga/compensacao-avanco.port';
import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import type { ReservaEstoqueGateway } from '../ports/reserva-estoque.gateway';

export interface AjustarEstoqueDivergenciaInput {
  pendenciaId: string;
  pecaId: string;
  quantidadeFisicaNova: number;
  motivo: string;
  responsavelId: string;
}

export class AjustarEstoqueDivergenciaUseCase {
  constructor(
    private readonly reservas: ReservaEstoqueGateway,
    private readonly unitOfWork: UnitOfWork,
    private readonly compensacao: CompensacaoAvancoPort,
  ) {}

  async execute(input: AjustarEstoqueDivergenciaInput): Promise<void> {
    await this.unitOfWork.executar(async (contexto) => {
      const resultado = await this.reservas.ajustarFisicoAdministrativo(
        contexto,
        input,
      );
      await this.compensacao.avancarSeEmCancelamento(
        contexto,
        resultado.ordemServicoId,
        randomUUID(),
      );
    });
  }
}
