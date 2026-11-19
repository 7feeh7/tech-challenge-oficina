import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const TAMANHO_MAXIMO_MOTIVO_RESOLUCAO_MANUAL = 500;

export class ResolverPendenciaManualDto {
  @ApiProperty({
    maxLength: TAMANHO_MAXIMO_MOTIVO_RESOLUCAO_MANUAL,
    description: 'Motivo da resolução; espaços nas pontas são removidos.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(TAMANHO_MAXIMO_MOTIVO_RESOLUCAO_MANUAL)
  motivo!: string;
}
