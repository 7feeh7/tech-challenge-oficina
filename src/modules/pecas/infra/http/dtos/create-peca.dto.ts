import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePecaDto {
  @ApiProperty({ example: 'FLT-001', description: 'Código único da peça' })
  @IsString()
  @IsNotEmpty({ message: 'O código é obrigatório.' })
  codigo!: string;

  @ApiProperty({ example: 'Filtro de óleo', description: 'Nome da peça' })
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @ApiPropertyOptional({
    example: 'Filtro de óleo para motores 1.0 a 2.0',
    description: 'Descrição detalhada da peça',
  })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiProperty({ example: 29.9, description: 'Preço unitário da peça' })
  @IsNumber({}, { message: 'O preço unitário deve ser um número.' })
  @IsPositive({ message: 'O preço unitário deve ser positivo.' })
  @Type(() => Number)
  precoUnitario!: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Quantidade em estoque',
    default: 0,
  })
  @IsInt({ message: 'A quantidade em estoque deve ser um número inteiro.' })
  @Min(0, { message: 'A quantidade em estoque não pode ser negativa.' })
  @IsOptional()
  @Type(() => Number)
  quantidadeEstoque?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Quantidade mínima de estoque (alerta)',
    default: 0,
  })
  @IsInt({ message: 'O estoque mínimo deve ser um número inteiro.' })
  @Min(0, { message: 'O estoque mínimo não pode ser negativo.' })
  @IsOptional()
  @Type(() => Number)
  estoqueMinimo?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Indica se a peça está ativa',
    default: true,
  })
  @IsBoolean({ message: 'O campo ativo deve ser booleano.' })
  @IsOptional()
  ativo?: boolean;
}
