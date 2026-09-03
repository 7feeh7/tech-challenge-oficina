import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusOrcamento } from '@/modules/orcamentos/domain/status-orcamento';
import { CreateOrcamentoDto } from './create-orcamento.dto';

export class UpdateOrcamentoDto extends PartialType(CreateOrcamentoDto) {
  @ApiPropertyOptional({
    enum: StatusOrcamento,
    description: 'Novo status do orçamento',
  })
  @IsEnum(StatusOrcamento)
  @IsOptional()
  status?: StatusOrcamento;

  @ApiPropertyOptional({
    description: 'Motivo de rejeição (obrigatório ao rejeitar)',
  })
  @IsString()
  @IsOptional()
  motivoRejeicao?: string;
}
