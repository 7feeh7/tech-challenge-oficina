import {
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoMovimentacaoEstoque } from '@/generated/prisma/enums';

export class CreateMovimentacaoEstoqueDto {
  @ApiProperty({ description: 'ID da peça', format: 'uuid' })
  @IsUUID()
  pecaId: string;

  @ApiProperty({
    enum: TipoMovimentacaoEstoque,
    description: 'Tipo: ENTRADA ou BAIXA',
  })
  @IsEnum(TipoMovimentacaoEstoque)
  tipo: TipoMovimentacaoEstoque;

  @ApiProperty({ description: 'Quantidade movimentada', minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantidade: number;

  @ApiPropertyOptional({
    description: 'ID da OS (quando for baixa por OS)',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  ordemServicoId?: string;

  @ApiPropertyOptional({ description: 'Observação adicional' })
  @IsString()
  @IsOptional()
  observacao?: string;
}
