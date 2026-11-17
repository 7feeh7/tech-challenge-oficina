import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DesistenciaOrdemServicoDto {
  @ApiProperty({ description: 'Motivo da desistência do cliente' })
  @IsString()
  @MinLength(1)
  motivo: string;
}
