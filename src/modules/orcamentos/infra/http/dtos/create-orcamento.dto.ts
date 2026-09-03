import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrcamentoDto {
  @ApiProperty({ description: 'ID da ordem de serviço', format: 'uuid' })
  @IsUUID()
  ordemServicoId: string;

  @ApiProperty({ description: 'Valor total do orçamento', example: 350.0 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  valorTotal: number;

  @ApiPropertyOptional({ description: 'Observações sobre o orçamento' })
  @IsString()
  @IsOptional()
  observacoes?: string;
}
