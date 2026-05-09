import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CreateOrcamentoDto } from './create-orcamento.dto';
import { StatusOrcamento } from '@/generated/prisma/enums';

export class UpdateOrcamentoDto extends PartialType(CreateOrcamentoDto) {
  @ApiPropertyOptional({ enum: StatusOrcamento, description: 'Novo status do orçamento' })
  @IsEnum(StatusOrcamento)
  @IsOptional()
  status?: StatusOrcamento;

  @ApiPropertyOptional({ description: 'Motivo de rejeição (obrigatório ao rejeitar)' })
  @IsString()
  @IsOptional()
  motivoRejeicao?: string;
}
