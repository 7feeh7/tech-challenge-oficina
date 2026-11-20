import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class ItemReservaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pecaId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  quantidade!: number;
}

class AjusteFisicoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pecaId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  quantidadeFisicaNova!: number;
}

export class ResolverConsumoManualDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pendenciaId!: string;

  @ApiProperty({ type: [ItemReservaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemReservaDto)
  itensConsumidos!: ItemReservaDto[];

  @ApiProperty({ type: [ItemReservaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemReservaDto)
  itensLiberados!: ItemReservaDto[];

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  motivo!: string;

  @ApiPropertyOptional({ type: [AjusteFisicoDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AjusteFisicoDto)
  ajustesFisicos?: AjusteFisicoDto[];
}
