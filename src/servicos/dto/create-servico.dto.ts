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

export class CreateServicoDto {
  @ApiProperty({
    example: 'Troca de óleo',
    description: 'Nome do serviço (deve ser único)',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @ApiPropertyOptional({
    example: 'Troca de óleo do motor com filtro',
    description: 'Descrição detalhada do serviço',
  })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiProperty({ example: 150.0, description: 'Preço base do serviço' })
  @IsNumber({}, { message: 'O preço base deve ser um número.' })
  @IsPositive({ message: 'O preço base deve ser positivo.' })
  @Type(() => Number)
  precoBase!: number;

  @ApiProperty({
    example: 60,
    description: 'Tempo estimado de execução em minutos',
  })
  @IsInt({ message: 'O tempo estimado deve ser um número inteiro.' })
  @Min(1, { message: 'O tempo estimado deve ser de pelo menos 1 minuto.' })
  @Type(() => Number)
  tempoEstimadoMin!: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Indica se o serviço está ativo',
    default: true,
  })
  @IsBoolean({ message: 'O campo ativo deve ser booleano.' })
  @IsOptional()
  ativo?: boolean;
}
