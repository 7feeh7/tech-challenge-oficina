import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

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
  @IsString()
  @MaxLength(500)
  motivo!: string;
}
