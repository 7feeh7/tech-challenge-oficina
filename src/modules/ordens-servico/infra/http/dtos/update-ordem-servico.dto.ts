import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { CreateOrdemServicoDto } from './create-ordem-servico.dto';

export class UpdateOrdemServicoDto extends PartialType(CreateOrdemServicoDto) {
  @ApiPropertyOptional({ enum: StatusOS, description: 'Novo status da OS' })
  @IsEnum(StatusOS)
  @IsOptional()
  status?: StatusOS;
}
