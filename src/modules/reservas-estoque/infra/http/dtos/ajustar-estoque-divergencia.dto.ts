import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class AjustarEstoqueDivergenciaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pendenciaId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pecaId!: string;

  @ApiProperty({
    description: 'Nova quantidade física após o ajuste',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  quantidadeFisicaNova!: number;

  @ApiProperty({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo!: string;
}
