import { IsInt, IsUUID, Min } from 'class-validator';

export class ReservarOsInternoDto {
  @IsInt()
  @Min(1)
  rodada!: number;

  @IsUUID()
  orcamentoId!: string;
}
