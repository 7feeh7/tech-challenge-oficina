import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateVeiculoDto {
  @ApiProperty({ example: 'ABC1D23', description: 'Placa do veículo (formato Mercosul ou antigo)' })
  @IsString()
  @IsNotEmpty({ message: 'A placa é obrigatória.' })
  @Matches(/^[A-Z]{3}\d[A-Z\d]\d{2}$/, { message: 'Placa inválida.' })
  placa!: string;

  @ApiProperty({ example: 'Toyota', description: 'Marca do veículo' })
  @IsString()
  @IsNotEmpty({ message: 'A marca é obrigatória.' })
  marca!: string;

  @ApiProperty({ example: 'Corolla', description: 'Modelo do veículo' })
  @IsString()
  @IsNotEmpty({ message: 'O modelo é obrigatório.' })
  modelo!: string;

  @ApiProperty({ example: 2023, description: 'Ano de fabricação do veículo' })
  @IsInt({ message: 'O ano deve ser um número inteiro.' })
  @Min(1886, { message: 'Ano inválido.' })
  @Max(new Date().getFullYear() + 1, { message: 'Ano inválido.' })
  ano!: number;

  @ApiProperty({ example: 'uuid-do-cliente', description: 'UUID do cliente proprietário' })
  @IsUUID('4', { message: 'clienteId deve ser um UUID válido.' })
  @IsNotEmpty({ message: 'O clienteId é obrigatório.' })
  clienteId!: string;
}
