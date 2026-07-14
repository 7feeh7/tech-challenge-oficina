import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ItemServicoDto {
  @ApiProperty({ description: 'ID do serviço', format: 'uuid' })
  @IsUUID()
  servicoId: string;

  @ApiPropertyOptional({ description: 'Quantidade', minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantidade?: number;
}

export class ItemPecaDto {
  @ApiProperty({ description: 'ID da peça', format: 'uuid' })
  @IsUUID()
  pecaId: string;

  @ApiProperty({ description: 'Quantidade', minimum: 1 })
  @IsInt()
  @Min(1)
  quantidade: number;
}

export class CreateOrdemServicoDto {
  @ApiProperty({ description: 'ID do cliente', format: 'uuid' })
  @IsUUID()
  clienteId: string;

  @ApiProperty({ description: 'ID do veículo', format: 'uuid' })
  @IsUUID()
  veiculoId: string;

  @ApiPropertyOptional({
    description: 'Descrição do problema relatado pelo cliente',
  })
  @IsString()
  @IsOptional()
  descricaoProblema?: string;

  @ApiPropertyOptional({ description: 'Diagnóstico técnico' })
  @IsString()
  @IsOptional()
  diagnostico?: string;

  @ApiPropertyOptional({
    type: [ItemServicoDto],
    description: 'Serviços vinculados à OS',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemServicoDto)
  @IsOptional()
  servicos?: ItemServicoDto[];

  @ApiPropertyOptional({
    type: [ItemPecaDto],
    description: 'Peças utilizadas na OS',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPecaDto)
  @IsOptional()
  pecas?: ItemPecaDto[];
}
