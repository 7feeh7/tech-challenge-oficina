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
  ) {}

  async execute(input: AjustarEstoqueDivergenciaInput): Promise<void> {
    await this.unitOfWork.executar(async (contexto) => {
      await this.reservas.ajustarFisicoAdministrativo(contexto, input);
    });
  }
}
