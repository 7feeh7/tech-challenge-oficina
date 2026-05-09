import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateOrdemServicoDto } from './create-ordem-servico.dto';
import { StatusOS } from '@/generated/prisma/enums';

export class UpdateOrdemServicoDto extends PartialType(CreateOrdemServicoDto) {
  @ApiPropertyOptional({ enum: StatusOS, description: 'Novo status da OS' })
  @IsEnum(StatusOS)
  @IsOptional()
  status?: StatusOS;
}
